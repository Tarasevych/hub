// Залишок блоків 3, 4, 5 і 8 (26.10): політика мініатюр, кодове слово, план стирання, правила відправника.
import { readFileSync } from 'node:fs';
import { miniatuurBesluit, verbindingUitPrefetch } from '../../shared/miniatuur-beleid';
import { miniatuurModusVan } from '../../src/bestand/miniatuur-modus';
import { codewoordSterk, pogingToegestaan } from '../../shared/codewoord';
import { CODEWOORD_LOGIN_MS, codewoordRouteVrij, codewoordSessieId, poortNodig } from '../../shared/codewoord-poort';
import { zipNamenUitStaart } from '../../shared/zip-namen';
import { wisOpdrachten } from '../../shared/account-wissen';
import { magAutomatischOverschrijven } from '../../shared/afzender-regels';
import { kiesBeeld, voegBeeldStap } from '../../shared/beeld-geschiedenis';
import { toetsRijen } from '../../src/geheim/toetsen';

const lees = (p: string) => readFileSync(p, 'utf8');
const resultaten: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean) => { resultaten.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}`); };

function maakZip(namen: string[]): Uint8Array {
  const enc = new TextEncoder();
  const delen: Uint8Array[] = [];
  const cds: Uint8Array[] = [];
  let offset = 0;
  for (const naam of namen) {
    const nb = enc.encode(naam);
    const local = new Uint8Array(30 + nb.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(26, nb.length, true);
    local.set(nb, 30);
    delen.push(local);
    const cd = new Uint8Array(46 + nb.length);
    const c = new DataView(cd.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(28, nb.length, true);
    c.setUint32(42, offset, true);
    cd.set(nb, 46);
    cds.push(cd);
    offset += local.length;
  }
  const cdBytes = concat(cds);
  const eocd = new Uint8Array(22);
  const e = new DataView(eocd.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, namen.length, true);
  e.setUint16(10, namen.length, true);
  e.setUint32(12, cdBytes.length, true);
  e.setUint32(16, offset, true);
  return concat([...delen, cdBytes, eocd]);
}
function concat(delen: Uint8Array[]): Uint8Array {
  const n = delen.reduce((s, d) => s + d.length, 0);
  const uit = new Uint8Array(n);
  let o = 0;
  for (const d of delen) { uit.set(d, o); o += d.length; }
  return uit;
}

export async function main() {
  const MB = 1_000_000;
  check('авто і 2G нічого не качає, доки не попросили', !miniatuurBesluit({ modus: 'auto', verbinding: '2g', saveData: true, bytes: 1000, gevraagd: false }).laden);
  check('авто на швидкій мережі: 3 МБ так, 5 МБ ні', miniatuurBesluit({ modus: 'auto', verbinding: 'snel', saveData: false, bytes: 3 * MB, gevraagd: false }).laden
    && !miniatuurBesluit({ modus: 'auto', verbinding: verbindingUitPrefetch('full'), saveData: false, bytes: 5 * MB, gevraagd: false }).laden);
  check('3G відмовляє 2 МБ', !miniatuurBesluit({ modus: 'auto', verbinding: '3g', saveData: false, bytes: 2 * MB, gevraagd: false }).laden);
  check('завжди пускає 7 МБ і ріже 9 МБ', miniatuurBesluit({ modus: 'altijd', verbinding: '2g', saveData: true, bytes: 7 * MB, gevraagd: false }).laden
    && !miniatuurBesluit({ modus: 'altijd', verbinding: 'snel', saveData: false, bytes: 9 * MB, gevraagd: false }).laden);
  check('на вимогу лише після кліку', !miniatuurBesluit({ modus: 'op-verzoek', verbinding: 'snel', saveData: false, bytes: 1000, gevraagd: false }).laden
    && miniatuurBesluit({ modus: 'op-verzoek', verbinding: 'snel', saveData: false, bytes: 1000, gevraagd: true }).laden);
  check('битий режим стає авто', miniatuurModusVan('nope') === 'auto' && miniatuurModusVan('altijd') === 'altijd');

  check('кодове слово: коротке і цифри ні, фраза так', !codewoordSterk('kort') && !codewoordSterk('12345678') && codewoordSterk('blauwe-fiets') && !codewoordSterk('pavlo', 'pavlo@example.com'));
  const nu = 1_700_000_000_000;
  check('п’ята помилка блокує на 15 хвилин', !pogingToegestaan(5, nu + 60_000, nu).ok && pogingToegestaan(5, nu - 1, nu).ok);

  const plan = wisOpdrachten([
    { schema: 'app', tabel: 'mail_afzenders', kolommen: ['user_id', 'owner_id'] },
    { schema: 'app', tabel: 'records', kolommen: ['owner_id'] },
    { schema: 'app', tabel: 'users', kolommen: ['id'] },
    { schema: 'public', tabel: 'users;drop', kolommen: ['user_id'] },
    { schema: 'pg_catalog', tabel: 'pg_authid', kolommen: ['user_id'] },
  ], 'gebruiker-1');
  check('план стирання: один DELETE з WHERE, без users і records і без сміттєвої назви', plan.length === 1 && plan[0].sql === 'DELETE FROM app.mail_afzenders WHERE owner_id = $1' && plan[0].params[0] === 'gebruiker-1' && plan.every((o) => o.sql.includes('WHERE')));

  check('ручна підозра не знімається автоматично', magAutomatischOverschrijven('HANDMATIG_VERDACHT', 'geverifieerd') === false && magAutomatischOverschrijven('BEKENDE_DIENST_ZONDER_PASS', 'geverifieerd') === true);

  const editor = lees('src/MailOpstelBewerker.tsx');
  const css = lees('src/mail-opstel-bewerker.css');
  check('редактор лишає рідне меню і має Ctrl+B', editor.includes("data-native-context='1'") && editor.includes("'Mod-b':toggleMark(schema.marks.strong)") && !editor.includes('onContextMenu={event=>event.preventDefault()}') && css.includes('height:auto;min-height:38px') && !css.includes('!important;height:38px'));
  const wissen = lees('backend/index.ts');
  check('видалення акаунта одразу і не чіпає власника', wissen.includes('accountMeteenWissen') && wissen.includes('OWNER_NIET_WISSEN') && wissen.includes('codewoordEis'));
  const afz = lees('backend/mail-afzenders.ts');
  check('черга і перегляд вердикту підключені', afz.includes('contactenTaakLopen') && afz.includes('herbeoordeelUitBewijs') && afz.includes('magAutomatischOverschrijven') && lees('src/afzenders/ScanPaneel.tsx').includes('Продовжити неперевірені'));
  check('ручне збереження ставить контакт', /if \(!basis\.inContacten\) historie = metHistorie\(historie, \{ op: 'in-contacten'/.test(afz) && afz.includes('inContacten: true, geverifieerdOp'));
  const stappen = [1, 2, 3, 4, 5, 6].reduce((h, n) => voegBeeldStap(h, { bron: `b${n}`, data: `data:image/png;base64,${n}`, tijd: n }), [] as ReturnType<typeof voegBeeldStap>);
  const opnieuw = voegBeeldStap(stappen, { bron: 'b2', data: 'data:image/png;base64,nieuw', tijd: 9 });
  check('історія фото: п’ять, новіша зверху, той самий джерело замінює', stappen.length === 5 && stappen[0].bron === 'b6' && !stappen.some((s) => s.bron === 'b1') && opnieuw[0].bron === 'b2' && kiesBeeld(opnieuw, 'b4')?.bron === 'b4' && !voegBeeldStap(stappen, { bron: 'x', data: 'https://evil' }).some((s) => s.data.startsWith('https')));
  const contacten = lees('src/afzenders/ContactenWeergave.tsx');
  check('картки контактів із фото і перемикачем', contacten.includes("data-weergave={weergave}") && contacten.includes("t(lang, 'Картки', 'Kaarten')") && contacten.includes('ctv-kaart') && contacten.includes('<AfzenderFoto'));
  const geheim = ['src/toegangslaag-panelen.tsx', 'src/BeheerSleutelsWeergave.tsx', 'src/ApiPlatformWeergave.tsx', 'src/agenten/TabExternMcp.tsx', 'src/McpAppsWeergave.tsx', 'src/agenda/Agenda.tsx', 'src/agenda/ICloudVenster.tsx', 'src/extern/ExternBureaublad.tsx', 'src/mail/MailKoppelVenster.tsx', 'src/integraties/Wizard.tsx'];
  check('секретні поля йдуть через екранну клавіатуру', geheim.every((p) => lees(p).includes('GeheimInvoer')) && !geheim.some((p) => lees(p).includes("type='password'")));

  const werk = lees('src/GoogleMailWerkruimte.tsx');
  const dialoog = lees('src/MailNieuwBerichtDialoog.tsx');
  check('чернетка Gmail з текстом іде в написати, не в читач', werk.includes("labelIds.includes('DRAFT')") && werk.includes("new CustomEvent('mail:open-concept'") && dialoog.includes('detail.gmail'));
  check('pdf.js без eval', lees('src/MailPdfVoorbeeld.tsx').includes('isEvalSupported:false'));
  const uk = toetsRijen('uk', 'letters', false);
  const cijfers = toetsRijen('uk', 'cijfers', false).flat().join('');
  check('клавіатура: українські літери, цифри, без значення в data-атрибуті', uk[0]?.includes('й') && uk[2]?.includes('ґ') && cijfers.includes('1') && lees('src/geheim/SchermToetsenbord.tsx').includes('tabIndex={-1}') && lees('src/App.tsx').includes('<GeheimInvoer'));

  const nuPoort = 1_700_000_000_000;
  check('ворота входу: без слова зачинені, зі словом відкриті до цієї сесії', !poortNodig(false, 0, nuPoort) && poortNodig(true, 0, nuPoort) && !poortNodig(true, nuPoort - 1000, nuPoort) && poortNodig(true, nuPoort - CODEWOORD_LOGIN_MS, nuPoort));
  check('ворота не чіпають вихід і bootstrap', codewoordRouteVrij('POST /api/owner/session/bootstrap') && codewoordRouteVrij('POST /api/owner/session/codewoord') && codewoordRouteVrij('POST /api/owner/session/logout-current') && !codewoordRouteVrij('POST /api/account/delete'));
  check('сесія воріт: свій якір, інакше вкладка', codewoordSessieId({ userId: 'a', anchorUserId: 'a', anchorId: 'anker', tabUserId: 'b', tabId: 'tab' }) === 'anker' && codewoordSessieId({ userId: 'b', anchorUserId: 'a', anchorId: 'anker', tabUserId: 'b', tabId: 'tab' }) === 'tab');
  const poortBron = lees('backend/index.ts') + lees('backend/codewoord.ts') + lees('src/App.tsx') + lees('src/platform/client.ts');
  check('другий крок входу стоїть на сесії і у вікні', poortBron.includes('CODEWOORD_POORT') && poortBron.includes('if(codewoordPoort)return{user:publicUser(user)') && poortBron.includes("POST /api/owner/session/codewoord") && poortBron.includes('<CodewoordPoort') && poortBron.includes('zetCodewoordPoort'));
  check('PEM і ключ SSH йдуть через ту саму клавіатуру', lees('src/integraties/Wizard.tsx').includes("soort='pem'") && lees('src/extern/ExternBureaublad.tsx').includes("soort='pem'") && lees('src/geheim/GeheimInvoer.tsx').includes('<textarea'));

  const zip = maakZip(['brief.txt', '../etc/passwd', 'map/foto.png']);
  const staart = zip.subarray(Math.max(0, zip.length - 200));
  const namen = zipNamenUitStaart(staart, zip.length, 8);
  const heel = zipNamenUitStaart(zip, zip.length, 8);
  const zip64 = new Uint8Array(zip);
  const ev = new DataView(zip64.buffer, zip64.byteOffset, zip64.byteLength);
  let eocd = -1;
  for (let i = zip64.length - 22; i >= 0; i--) if (ev.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  ev.setUint16(eocd + 10, 0xffff, true);
  check('zip: імена з хвоста, без шляху назовні, zip64 не вгадується', namen.namen.join(',') === 'brief.txt,map/foto.png' && heel.namen.length === 2 && zipNamenUitStaart(zip64, zip64.length).fout === 'zip64');
  const mini = lees('src/MailBijlageMiniatuur.tsx');
  check('мініатюра zip не качає цілий файл і читає хвіст чергою', mini.includes("if(descriptor.kind==='archive')return") && mini.includes('zipNamenUitStaart') && mini.includes('naElkaar'));

  const mis = resultaten.filter((r) => !r.ok);
  console.log(`${resultaten.length - mis.length}/${resultaten.length} geslaagd (rest-20261026)`);
  return mis.length ? 1 : 0;
}
