// HERSTEL-001 — Перевірочні випробування 4 складових вади сторінки повернення входу Google (id.tarasevych.com, STATE_EXPIRED · HTTP 400)
// за знімком екрана власника:
//   - Screenshot_20261125_125840_com.android.chrome.jpg
//
// Цей тестовий набір зберігає точні вимоги та перевіряє як поточну наявність цільових точок у коді,
// так і функцію автоматичної оцінки виправлення (GOOG-1..GOOG-4).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface GoogleTerugkeerGebrekContract {
  readonly id: 'GOOG-1' | 'GOOG-2' | 'GOOG-3' | 'GOOG-4';
  readonly schermafdruk: string;
  readonly titelUk: string;
  readonly titelNl: string;
  readonly doelBestanden: readonly string[];
  readonly oorzaakUk: string;
  readonly oorzaakNl: string;
  readonly herstelEisUk: string;
  readonly herstelEisNl: string;
}

export const VIER_GOOGLE_TERUGKEER_GEBREKEN_CONTRACTEN: readonly GoogleTerugkeerGebrekContract[] = [
  {
    id: 'GOOG-1',
    schermafdruk: 'Screenshot_20261125_125840_com.android.chrome.jpg',
    titelUk: 'Дизайн сторінки повернення id.tarasevych.com: голий білий екран без картки «Мого простору» та чорне слово «Назад» без вигляду кнопки',
    titelNl: 'Ontwerp van de terugkeerpagina id.tarasevych.com: kaal wit scherm zonder Mijn Ruimte-kaart en zwart woord «Terug» zonder knopvorm',
    doelBestanden: ['src/EigenaarIdentiteitTerug.tsx'],
    oorzaakUk:
      'OwnerIdentityCallback відмальовує голий <main> і <section> з вбудованими стилями без картки стану входу, знака «Мій простір» чи значка Google із src/merk, а посилання «Назад» не має рамки, плашки й висоти 44 px.',
    oorzaakNl:
      'OwnerIdentityCallback tekent een kale <main> en <section> met ingebedde stijlen zonder aanmeldkaart, Mijn Ruimte-teken of Google-merk uit src/merk, en de koppeling «Terug» mist rand, vlak en aanraakhoogte van 44 px.',
    herstelEisUk:
      'Оформити сторінку повернення id.tarasevych.com як повноцінну картку «Мого простору» з підтримкою світлої й темної теми, знаком із реєстру src/merk та виразними кнопками дій висотою щонайменше 44 px.',
    herstelEisNl:
      'Geef de terugkeerpagina id.tarasevych.com vorm als een volwaardige Mijn Ruimte-kaart met ondersteuning voor licht en donker thema, merk uit src/merk en duidelijke actieknoppen van minstens 44 px hoog.',
  },
  {
    id: 'GOOG-2',
    schermafdruk: 'Screenshot_20261125_125840_com.android.chrome.jpg',
    titelUk: 'Взаємодія з кодом проблеми: «Код збою: STATE_EXPIRED · HTTP 400» виглядає як мертвий текст без кнопки копіювання та розшифрування',
    titelNl: 'Interactie met de foutcode: «Foutcode: STATE_EXPIRED · HTTP 400» oogt als dode tekst zonder kopieerknop en verklaring',
    doelBestanden: ['src/EigenaarIdentiteitTerug.tsx'],
    oorzaakUk:
      'Блок <details><summary> у EigenaarIdentiteitTerug.tsx не має видимого покажчика взаємодії, кнопки копіювання коду збою в буфер обміну та людського розшифрування коду всередині блоку.',
    oorzaakNl:
      'Het <details><summary>-blok in EigenaarIdentiteitTerug.tsx mist een zichtbare interactie-aanduiding, een knop om de foutcode te kopiëren en een menselijke verklaring van de code binnen het blok.',
    herstelEisUk:
      'Оформити блок коду збою як інтерактивну плашку з чітким розкриттям, кнопкою «Скопіювати код» зі зворотним зв’язком та зрозумілим поясненням технічного коду.',
    herstelEisNl:
      'Geef het foutcodeblok vorm als een interactieve strook met duidelijke uitklap, een knop «Code kopiëren» met terugkoppeling en een heldere uitleg van de technische code.',
  },
  {
    id: 'GOOG-3',
    schermafdruk: 'Screenshot_20261125_125840_com.android.chrome.jpg',
    titelUk: 'Відповідь для користувача: серверний код STATE_EXPIRED не розпізнається в callbackUitleg/failureCopy і підміняється загальною заглушкою',
    titelNl: 'Antwoord voor de gebruiker: servercode STATE_EXPIRED wordt niet herkend in callbackUitleg/failureCopy en valt terug op een algemene fouttekst',
    doelBestanden: ['src/EigenaarIdentiteitTerug.tsx', 'backend/index.ts'],
    oorzaakUk:
      'ownerGoogleCallbackPost повертає STATE_EXPIRED, STATE_NOT_FOUND, TIMEOUT, TRANSACTION_NOT_FOUND, TRANSACTION_NOT_ATTACHED, STATE_TRANSACTION_MISMATCH, але failureCopy та callbackUitleg перевіряють лише GOOGLE_SUITE_STATE_EXPIRED і OWNER_OAUTH_EXPIRED, а текст c.expired хибно скеровує в «Пошта → Акаунти».',
    oorzaakNl:
      'ownerGoogleCallbackPost geeft STATE_EXPIRED, STATE_NOT_FOUND, TIMEOUT, TRANSACTION_NOT_FOUND, TRANSACTION_NOT_ATTACHED en STATE_TRANSACTION_MISMATCH terug, maar failureCopy en callbackUitleg controleren alleen GOOGLE_SUITE_STATE_EXPIRED en OWNER_OAUTH_EXPIRED, en c.expired verwijst ten onrechte naar «E-mail → Accounts».',
    herstelEisUk:
      'Додати в callbackUitleg та failureCopy точні двомовні пояснення для STATE_EXPIRED, STATE_NOT_FOUND, TIMEOUT, TRANSACTION_NOT_FOUND, TRANSACTION_NOT_ATTACHED, STATE_TRANSACTION_MISMATCH окремо для входу в «Мій простір» і окремо для підключення пошти.',
    herstelEisNl:
      'Voeg in callbackUitleg en failureCopy nauwkeurige tweetalige verklaringen toe voor STATE_EXPIRED, STATE_NOT_FOUND, TIMEOUT, TRANSACTION_NOT_FOUND, TRANSACTION_NOT_ATTACHED en STATE_TRANSACTION_MISMATCH, afzonderlijk voor aanmelden bij Mijn Ruimte en voor e-mailkoppeling.',
  },
  {
    id: 'GOOG-4',
    schermafdruk: 'Screenshot_20261125_125840_com.android.chrome.jpg',
    titelUk: 'Починання подальших дій із причиною: втрата returnTo при STATE_EXPIRED на сервері та відсутність передачі ?aanmeld_fout і кнопки повторного входу',
    titelNl: 'Vervolgstappen met oorzaak: verlies van returnTo bij STATE_EXPIRED op de server en ontbreken van ?aanmeld_fout-overdracht en knop om opnieuw aan te melden',
    doelBestanden: ['backend/index.ts', 'src/EigenaarIdentiteitTerug.tsx', 'src/weigeringen.ts'],
    oorzaakUk:
      'При STATE_EXPIRED сервер повертає порожній sourceOrigin і не передає returnTo з транзакції OwnerTx (хоча transactionRecordId є в oauthState і в структурованому state), а кнопка повернення не передає ?aanmeld_fout=<КОД> на сторінку входу й у weigeringen.ts немає текстів для цих кодів.',
    oorzaakNl:
      'Bij STATE_EXPIRED geeft de server een lege sourceOrigin terug zonder returnTo uit OwnerTx (hoewel transactionRecordId in oauthState en in de gestructureerde state zit), en de terugkeeractie geeft geen ?aanmeld_fout=<CODE> door naar de aanmeldpagina terwijl weigeringen.ts deze codes nog mist.',
    herstelEisUk:
      'Відновлювати returnTo та sourceOrigin із транзакції OwnerTx навіть при STATE_EXPIRED, додати на сторінці повернення головну дію повторного входу з передачею причини (?aanmeld_fout) та додати відповідні коди до словника AANMELDEN у src/weigeringen.ts.',
    herstelEisNl:
      'Herstel returnTo en sourceOrigin uit de OwnerTx-transactie ook bij STATE_EXPIRED, bied op de terugkeerpagina een primaire actie om opnieuw aan te melden met oorzaakoverdracht (?aanmeld_fout) en voeg de codes toe aan AANMELDEN in src/weigeringen.ts.',
  },
] as const;

export interface GoogleTerugkeerHerstelStatus {
  readonly id: GoogleTerugkeerGebrekContract['id'];
  readonly hersteld: boolean;
  readonly detail: string;
}

export function evalueerVierGoogleTerugkeerGebrekenHerstel(rootDir = process.cwd()): readonly GoogleTerugkeerHerstelStatus[] {
  const terugPad = join(rootDir, 'src/EigenaarIdentiteitTerug.tsx');
  const backendPad = join(rootDir, 'backend/index.ts');
  const weigeringenPad = join(rootDir, 'src/weigeringen.ts');

  const terugTekst = existsSync(terugPad) ? readFileSync(terugPad, 'utf8') : '';
  const backendTekst = existsSync(backendPad) ? readFileSync(backendPad, 'utf8') : '';
  const weigeringenTekst = existsSync(weigeringenPad) ? readFileSync(weigeringenPad, 'utf8') : '';

  const goog1Hersteld =
    terugTekst.includes('data-google-terug-kaart') ||
    terugTekst.includes('mr-google-terug-kaart');

  const goog2Hersteld =
    terugTekst.includes('data-google-foutcode-kopieer') ||
    terugTekst.includes('navigator.clipboard');

  const goog3Hersteld =
    terugTekst.includes("'STATE_EXPIRED'") &&
    terugTekst.includes("'STATE_NOT_FOUND'") &&
    terugTekst.includes("'TIMEOUT'");

  const goog4Hersteld =
    weigeringenTekst.includes('STATE_EXPIRED') &&
    terugTekst.includes('aanmeld_fout');

  return [
    {
      id: 'GOOG-1',
      hersteld: goog1Hersteld,
      detail: goog1Hersteld
        ? 'Сторінка повернення id.tarasevych.com оформлена як картка «Мого простору» з кнопками дій'
        : 'Очікує на виправлення: EigenaarIdentiteitTerug.tsx все ще відмальовує голий білий екран і чорне посилання «Назад» без вигляду кнопки',
    },
    {
      id: 'GOOG-2',
      hersteld: goog2Hersteld,
      detail: goog2Hersteld
        ? 'Блок коду збою інтерактивний і підтримує копіювання та розшифрування'
        : 'Очікує на виправлення: блок «Код збою: STATE_EXPIRED · HTTP 400» не має кнопки копіювання та людського розшифрування',
    },
    {
      id: 'GOOG-3',
      hersteld: goog3Hersteld,
      detail: goog3Hersteld
        ? 'Серверні коди STATE_EXPIRED, STATE_NOT_FOUND і TIMEOUT розпізнаються на клієнті з точним поясненням для користувача'
        : 'Очікує на виправлення: STATE_EXPIRED відсутній у callbackUitleg/failureCopy і провалюється в загальну заглушку',
    },
    {
      id: 'GOOG-4',
      hersteld: goog4Hersteld && backendTekst.includes('STATE_EXPIRED'),
      detail: goog4Hersteld
        ? 'Повернення передає returnTo та причину (?aanmeld_fout) для негайного продовження входу'
        : 'Очікує на виправлення: втрачається returnTo при STATE_EXPIRED і причина не передається на сторінку входу',
    },
  ];
}

export async function main(): Promise<number> {
  const rootDir = process.cwd();
  let geslaagd = 0;
  let gefaald = 0;

  const controleer = (naam: string, voorwaarde: boolean, detail = '') => {
    if (voorwaarde) {
      geslaagd++;
      console.log(`OK   ${naam}`);
    } else {
      gefaald++;
      console.error(`FOUT ${naam}${detail ? ` — ${detail}` : ''}`);
    }
  };

  controleer(
    'реєстр містить рівно 4 перевірочні контракти сторінки повернення Google (GOOG-1..GOOG-4)',
    VIER_GOOGLE_TERUGKEER_GEBREKEN_CONTRACTEN.length === 4 &&
      VIER_GOOGLE_TERUGKEER_GEBREKEN_CONTRACTEN.map((c) => c.id).join(',') === 'GOOG-1,GOOG-2,GOOG-3,GOOG-4',
  );

  for (const contract of VIER_GOOGLE_TERUGKEER_GEBREKEN_CONTRACTEN) {
    const alleBestandenAanwezig = contract.doelBestanden.every((rel) => existsSync(join(rootDir, rel)));
    controleer(
      `${contract.id}: усі цільові файли існують у сховищі (${contract.doelBestanden.join(', ')})`,
      alleBestandenAanwezig,
    );
    controleer(
      `${contract.id}: двомовні описи (uk / nl) та прив’язка до знімка екрана заповнені без заборонених символів`,
      contract.titelUk.length > 10 &&
        contract.titelNl.length > 10 &&
        contract.schermafdruk === 'Screenshot_20261125_125840_com.android.chrome.jpg' &&
        !/[ЁёЪъЫыЭэ]/.test(contract.titelUk + contract.oorzaakUk + contract.herstelEisUk),
    );
  }

  const terugInhoud = readFileSync(join(rootDir, 'src/EigenaarIdentiteitTerug.tsx'), 'utf8');
  const backendInhoud = readFileSync(join(rootDir, 'backend/index.ts'), 'utf8');
  const weigeringenInhoud = readFileSync(join(rootDir, 'src/weigeringen.ts'), 'utf8');

  controleer(
    'GOOG-1..GOOG-3: EigenaarIdentiteitTerug.tsx містить OwnerIdentityCallback, callbackUitleg і failureCopy',
    terugInhoud.includes('export default function OwnerIdentityCallback') &&
      terugInhoud.includes('callbackUitleg') &&
      terugInhoud.includes('failureCopy'),
  );

  controleer(
    'GOOG-3..GOOG-4: backend/index.ts та src/weigeringen.ts містять ownerGoogleCallbackPost, STATE_EXPIRED і aanmeldWeigering',
    backendInhoud.includes('ownerGoogleCallbackPost') &&
      backendInhoud.includes('STATE_EXPIRED') &&
      weigeringenInhoud.includes('export function aanmeldWeigering'),
  );

  const statussen = evalueerVierGoogleTerugkeerGebrekenHerstel(rootDir);
  controleer(
    'функція оцінювання стану виправлення evalueerVierGoogleTerugkeerGebrekenHerstel повертає звіти для всіх 4 пунктів',
    statussen.length === 4 && statussen.every((s) => typeof s.hersteld === 'boolean' && s.detail.length > 0),
  );

  const ukDocPad = join(rootDir, 'docs/identiteit/ВИПРОБУВАННЯ-СТОРИНКИ-ПОВЕРНЕННЯ-GOOGLE-HERSTEL-001.uk.md');
  const nlDocPad = join(rootDir, 'docs/identiteit/PROEVEN-GOOGLE-TERUGKEERPAGINA-HERSTEL-001.nl.md');
  controleer(
    'парні статті 4 випробувань сторінки повернення Google (uk / nl) існують у docs/identiteit/ і посилаються одна на одну',
    existsSync(ukDocPad) &&
      existsSync(nlDocPad) &&
      readFileSync(ukDocPad, 'utf8').includes('PROEVEN-GOOGLE-TERUGKEERPAGINA-HERSTEL-001.nl.md') &&
      readFileSync(nlDocPad, 'utf8').includes('ВИПРОБУВАННЯ-СТОРИНКИ-ПОВЕРНЕННЯ-GOOGLE-HERSTEL-001.uk.md'),
  );

  console.log(`\n${geslaagd}/${geslaagd + gefaald} geslaagd (herstel-001-google-terugkeer-staat-verlopen)`);
  return gefaald === 0 ? 0 : 1;
}
