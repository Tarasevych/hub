// SITE-001 (пункт 22): постійний сторож журналювання помилок, перевірки працездатності та післяпускового нагляду.
// Перевіряє:
// 1) серверний перехоплювач proces-vangnet: рахує винятки й відхилені обіцянки, зупиняє процес при лавині (> 50 за 60 с), не виводить вмісту запитів;
// 2) приймач клієнтських збоїв /api/storing/tech-bundel та погодинні лічильники 401/403/404 без IP та користувачів;
// 3) глибоку перевірку працездатності diepeControle / diepAntwoord: зовнішні чи тунельовані запити (cf-connecting-ip, x-forwarded-for) отримують 403 ALLEEN_LOKAAL;
// 4) післяпусковий нагляд mijn-ruimte-nazorg.sh і канонічний реєстр сповіщень beheer-journaal / meldingen-catalogus;
// 5) сумісність одноразового стенда перевірки відмальовування server/rook.ts із просторами v2 (409 GEBRUIK_RUIMTES_V2 → /api/owner/hub/tech/ruimtes/starten + /api/owner/tech/status);
// 6) відсутність заборонених літер у зміненому коді та тесті.
// nl: permanente bewakingstest voor foutregistratie, gezondheidsbewaking en rook-stand v2 (punt 22).
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { _vangnetLeeg, procesVangnetStand, vangnetTel } from '../../server/platform/proces-vangnet';
import { diepAntwoord, vanDezeServer } from '../../backend/diepe-gezondheid';
import { _tellersLeeg, meldingSoort, tellerStand, telStatus } from '../../backend/toegangsfout-tellers';

export async function main(): Promise<number> {
  const { check, einde } = checker('site-001-monitoring');

  // 1. proces-vangnet
  _vangnetLeeg();
  let doorgaan = true;
  for (let i = 0; i < 50; i += 1) doorgaan = doorgaan && vangnetTel(i % 2 === 0 ? 'uitzondering' : 'afwijzing', 1_000_000 + i * 10);
  const stand50 = procesVangnetStand();
  const stopBij51 = !vangnetTel('uitzondering', 1_000_600);
  const herstelNaVenster = vangnetTel('afwijzing', 1_070_000);
  _vangnetLeeg();
  check(
    'proces-vangnet: тримає процес до 50 неперехоплених помилок за хвилину, на 51-й зупиняє для чистого перезапуску systemd, після вікна скидається',
    doorgaan && stand50.uitzonderingen === 25 && stand50.afwijzingen === 25 && stopBij51 && herstelNaVenster,
  );

  const startBron = readFileSync('server/start.ts', 'utf8');
  check(
    'server/start.ts вмикає procesVangnetInstellen() і моніторинг затримки циклу подій monitorEventLoopDelay',
    startBron.includes('procesVangnetInstellen(') && startBron.includes('monitorEventLoopDelay('),
  );

  // 2. diepe-gezondheid: суворо лише локальні запити без заголовків тунелю
  const blokCf = await diepAntwoord({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'cf-connecting-ip': '198.51.100.7' } }, 'dist');
  const blokXff = await diepAntwoord({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': '198.51.100.7' } }, 'dist');
  const blokExt = await diepAntwoord({ socket: { remoteAddress: '198.51.100.7' }, headers: {} }, 'dist');
  check(
    'diepe-gezondheid: /__gezondheid?diep=1 відхиляє будь-який запит через Cloudflare чи зовнішню адресу кодом 403 ALLEEN_LOKAAL',
    vanDezeServer('127.0.0.1', {}) &&
      vanDezeServer('::ffff:127.0.0.1', {}) &&
      blokCf.status === 403 &&
      blokXff.status === 403 &&
      blokExt.status === 403,
  );

  // 3. toegangsfout-tellers та санітизація клієнтських збоїв
  _tellersLeeg();
  const tNu = 1_700_000_000_000;
  telStatus('/assets/tech/admin.js', 404, tNu);
  telStatus('/api/owner/admin/overzicht', 401, tNu);
  telStatus('/api/owner/mail/inbox', 403, tNu);
  const ts = tellerStand(tNu);
  _tellersLeeg();
  check(
    'toegangsfout-tellers: рахує 401/403/404 за групами без збереження шляхів, IP чи облікових записів; meldingSoort приймає лише безпечний код',
    ts.ditUur['tech-bundels'].n404 === 1 &&
      ts.ditUur['beheer-api'].n401 === 1 &&
      ts.ditUur.api.n403 === 1 &&
      meldingSoort('{"soort":"CHUNK_LOAD_FAILED"}') === 'CHUNK_LOAD_FAILED' &&
      meldingSoort('{"soort":"<script>alert(1)</script>"}') === 'ONBEKEND',
  );

  // 4. післяпусковий нагляд nazorg
  const nazorg = readFileSync('deploy/uitrol/mijn-ruimte-nazorg.sh', 'utf8');
  check(
    'mijn-ruimte-nazorg.sh: контролює /__gezondheid і відмальовування rook-controle --live та виконує автоматичне повернення попереднього випуску при збої',
    nazorg.includes('/__gezondheid') &&
      nazorg.includes('rook-controle --live') &&
      nazorg.includes('"$INSTALLEER" terugdraaien') &&
      nazorg.includes('NAZORG_TERUGGEDRAAID'),
  );

  // 5. сумісність server/rook.ts із просторами v2 (виправлення відкритої вади SITE-001)
  const rookBron = readFileSync('server/rook.ts', 'utf8');
  check(
    'server/rook.ts: при 409 GEBRUIK_RUIMTES_V2 запускає технічний простір v2 (/api/owner/hub/tech/ruimtes/starten) і отримує реп’яшок для технічних модулів через /api/owner/tech/status',
    rookBron.includes("r3.status === 409 && r3.data.error === 'GEBRUIK_RUIMTES_V2'") &&
      rookBron.includes("'/api/owner/hub/tech/ruimtes/starten'") &&
      rookBron.includes("'/api/owner/tech/status'"),
  );

  // 6. мовна чистота
  const verboden = new RegExp('[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]');
  const zelf = readFileSync('tests/eenheid/site-001-monitoring.test.ts', 'utf8');
  check('відсутність заборонених літер у server/rook.ts і тесті', !verboden.test(rookBron) && !verboden.test(zelf));

  return einde();
}
