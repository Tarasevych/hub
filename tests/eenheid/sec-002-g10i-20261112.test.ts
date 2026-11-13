// SEC-002 (12.11.2026), група «g10i»: відтворення й регресія знахідок privacy-logboek-02/05/06, post-01, keten-config-02/03,
// ai-mcp-03/05. Лише вигадані секрети й адреси; нічого не йде назовні.
// Запуск: DATABASE_URL=<власна тестова база> node scripts/eenheidstests.mjs sec-002-g10i-20261112.test.ts
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { db } from '../../server/platform/db';
import { auditControle, auditToevoegen } from '../../server/platform/audit';
import * as jsonVeilig from '../../server/platform/json-veilig';
import { actieDoel } from '../../shared/mcp-acties';
import * as bord from '../../shared/ai-agent-bord';
import * as journaal from '../../backend/beheer-journaal';
import { beheerJournaalRoutes } from '../../backend/beheer-journaal-routes';
import { schrijfBeheerAudit } from '../../backend/audit-gebeurtenis';
import { lijstTools, roepTool, werkDetails, type Wie } from '../../backend/mcp-connector';
import { vergeetStaat, zetStaat } from '../../backend/ai-site-schakelaars';
import * as mailTekst from '../../backend/mail-tekst-normalisatie';
import { gmailParserPolicySelfTest, normalizeGmailMessage } from '../../backend/mail-gmail';
import { microsoftProviderPolicySelfTest, normalizeMicrosoftMessage } from '../../backend/mail-microsoft';
import * as store from '../../backend/connectors-opslag';
import { sha256 } from '../../backend/connectors-crypto';
import { issueWsTicket, onConnection } from '../../backend/connectors-gateway';
import { mcpConsoleRoutes } from '../../backend/mcp-console';

const lees = (p: string) => readFileSync(p, 'utf8');
const eenzaam = (s: string) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);
const EMOJI = '\u{1F600}';
const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ms = (f: () => unknown): number => { const t = process.hrtime.bigint(); f(); return Number(process.hrtime.bigint() - t) / 1e6; };
/** Найкращий із трьох замірів: машина спільна, одиничний стрибок навантаження не має валити тест. */
const besteVan3 = (f: () => unknown): number => Math.min(ms(f), ms(f), ms(f));

// ---- еталон ДО патча (post-01): дослівно старі ланцюжки виразів із backend/mail-gmail.ts і backend/mail-microsoft.ts ----
const oudGmailStrip = (value: string) => mailTekst.normalizeMailDisplayText(value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n'));
const oudMicrosoftStrip = (value: string) => mailTekst.normalizeMailDisplayText(value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' '));
const gmailVanHtml = (html: string) => normalizeGmailMessage({ id: 'm', payload: { mimeType: 'text/html', headers: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: { data: Buffer.from(html, 'utf8').toString('base64url') } } });
const microsoftVanHtml = (html: string) => normalizeMicrosoftMessage({ id: 'm', body: { contentType: 'html', content: html } });

class NepWs extends EventEmitter {
  verstuurd: string[] = [];
  send(s: string) { this.verstuurd.push(s); }
  close(code?: number, reden?: string) { this.verstuurd.push(`CLOSE ${code} ${reden}`); this.emit('close'); }
  terminate() { this.emit('close'); }
}

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-g10i-20261112');

  // ================================================================ privacy-logboek-02 (чисті функції)
  {
    const jv = jsonVeilig as unknown as { tekstVeilig?: (s: string) => string; jsonbVeilig?: (s: string) => string; knipTekst?: (s: string, n: number) => string };
    const ruw = JSON.stringify({ a: 'x\u0000y', b: `z${EMOJI}`.slice(0, 2), 'k\u0000': 1, ['s\ud83d']: 2, c: 'letterlijk \\u0000 en \\ud83d blijft', d: `${EMOJI} heel` });
    const schoon = jv.jsonbVeilig ? jv.jsonbVeilig(ruw) : ruw;
    const terug = JSON.parse(schoon) as Record<string, unknown>;
    check('privacy-logboek-02: jsonbVeilig вичищає \\u0000 і самотні сурогати у значеннях І КЛЮЧАХ, а дослівний «\\u0000» та цілі емодзі не чіпає',
      !/\\u0000|\\ud[89a-f][0-9a-f]{2}/i.test(schoon.replace(/\\\\/g, '')) && terug.a === 'x\uFFFDy' && terug.b === 'z\uFFFD' && terug['k\uFFFD'] === 1 && terug['s\uFFFD'] === 2
      && terug.c === 'letterlijk \\u0000 en \\ud83d blijft' && terug.d === `${EMOJI} heel`, schoon.slice(0, 160));
    check('privacy-logboek-02: tekstVeilig і knipTekst — без NUL, без половини емодзі; звичайний текст без змін',
      !!jv.tekstVeilig && !!jv.knipTekst && jv.tekstVeilig('a\u0000b\ud83d') === 'a\uFFFDb\uFFFD' && jv.tekstVeilig(`ok ${EMOJI}`) === `ok ${EMOJI}`
      && jv.knipTekst(`ab${EMOJI}`, 3) === 'ab' && jv.knipTekst(`ab${EMOJI}`, 4) === `ab${EMOJI}` && jv.knipTekst('abcdef', 3) === 'abc' && jv.knipTekst('ab', 5) === 'ab');

    const pad = `/home/u/${'ab/'.repeat(30)}${EMOJI}geheim.txt`; // емодзі на позиціях 98–99: старе kort() різало посередині
    const doel = actieDoel('machine_write_file', { path: pad }) || '';
    const doel2 = actieDoel('machine_exec', { command: `${'echo b '.repeat(14)}${EMOJI} && curl kwaad` }) || '';
    check('privacy-logboek-02: actieDoel (kort) не лишає половини емодзі в кінці й не довший за 100', !eenzaam(doel) && !eenzaam(doel2) && doel.length <= 100 && doel2.length <= 100 && doel.endsWith('…'), `${doel.length}/${doel2.length}`);
    const sd = journaal.schoonDetails({ notitie: `${'n'.repeat(399)}${EMOJI}zz`, lijst: [`${'q'.repeat(399)}${EMOJI}zz`] }) as { notitie: string; lijst: string[] };
    check('privacy-logboek-02: schoonDetails ріже довгий текст по цілих символах', !eenzaam(sd.notitie) && !eenzaam(sd.lijst[0]) && sd.notitie.endsWith('…') && sd.notitie.length <= 401);
  }

  // ================================================================ post-01 / keten-config-02 (без бази)
  {
    const zelfG = gmailParserPolicySelfTest().filter((r) => !r.passed).map((r) => r.id);
    const zelfM = microsoftProviderPolicySelfTest().filter((r) => !r.passed).map((r) => r.id);
    check('post-01: наявні самоперевірки розбору Gmail і Microsoft лишаються зеленими', zelfG.length === 0 && zelfM.length === 0, [...zelfG, ...zelfM].join(', '));

    // 1) Малий розмір (48 КіБ): до патча ≈ 1 с на вираз (квадратично), після — мілісекунди.
    const KLEIN = 48 * 1024;
    const patronen: Array<[string, string]> = [['<', '<'], ['<script', '<script'], ['<style', '<style'], ['<a ', '<a '], ['<scRIPT>x', '<scRIPT>x']];
    const traagKlein: string[] = [];
    for (const [naam, stuk] of patronen) {
      const html = stuk.repeat(Math.ceil(KLEIN / stuk.length));
      const tg = besteVan3(() => gmailVanHtml(html)); const tm = besteVan3(() => microsoftVanHtml(html));
      if (tg > 250 || tm > 250) traagKlein.push(`${naam}: gmail ${tg.toFixed(0)} мс, microsoft ${tm.toFixed(0)} мс`);
    }
    check('post-01 / keten-config-02: 48 КіБ «ворожого» HTML («<», «<script», «<style» без закриття) розбираються < 250 мс (Gmail і Microsoft)', traagKlein.length === 0, traagKlein.join('; '));
    // 2) Великий розмір лише коли малий уже швидкий (інакше до патча цей блок тривав би хвилини).
    if (traagKlein.length === 0) {
      const GROOT = 2 * 1024 * 1024; const traag: string[] = [];
      for (const [naam, stuk] of patronen) {
        const html = stuk.repeat(Math.ceil(GROOT / stuk.length));
        const tg = besteVan3(() => gmailVanHtml(html)); const tm = besteVan3(() => microsoftVanHtml(html));
        if (tg > 400 || tm > 400) traag.push(`${naam}: gmail ${tg.toFixed(0)} мс, microsoft ${tm.toFixed(0)} мс`);
      }
      check('post-01 / keten-config-02: 2 МБ такого самого HTML — < 400 мс на лист (лінійно)', traag.length === 0, traag.join('; '));
      // суміжні варіанти в тих самих файлах: нормалізація NFC на довгій низці комбінівних знаків і текстова частина без меж
      const comb = `a${'\u0301\u0323'.repeat(150_000)}`;
      const tPlain = besteVan3(() => normalizeGmailMessage({ id: 'm', payload: { mimeType: 'text/plain', body: { data: Buffer.from(comb, 'utf8').toString('base64url') } } }));
      const tHtmlComb = besteVan3(() => gmailVanHtml(`<p>${comb}</p>`));
      const tMsComb = besteVan3(() => normalizeMicrosoftMessage({ id: 'm', subject: comb, body: { contentType: 'text', content: comb } }));
      const tEnt = besteVan3(() => gmailVanHtml('&a'.repeat(1024 * 1024)));
      check('post-01 (суміжне): 300 тис. комбінівних знаків підряд (квадратична NFC) і 2 МБ «&a» не блокують потік (< 400 мс)', tPlain < 400 && tHtmlComb < 400 && tMsComb < 400 && tEnt < 400,
        `plain ${tPlain.toFixed(0)}, html ${tHtmlComb.toFixed(0)}, microsoft ${tMsComb.toFixed(0)}, entiteiten ${tEnt.toFixed(0)} мс`);
      const veelDelen = { id: 'm', payload: { mimeType: 'multipart/mixed', parts: Array.from({ length: 40 }, (_, i) => ({ partId: String(i), mimeType: 'text/html', body: { data: Buffer.from('<'.repeat(1024 * 1024), 'utf8').toString('base64url') } })) } };
      const tDelen = ms(() => normalizeGmailMessage(veelDelen));
      const nDelen = normalizeGmailMessage(veelDelen);
      check('post-01 (суміжне): 40 HTML-частин по 1 МБ — один бюджет на лист, < 1,5 с, попередження HTML_BODY_TRUNCATED', tDelen < 1500 && nDelen.parseWarnings.includes('HTML_BODY_TRUNCATED') && nDelen.htmlBody.length <= 1_500_000, `${tDelen.toFixed(0)} мс`);
    } else check('post-01 / keten-config-02: 2 МБ такого самого HTML — < 400 мс на лист (лінійно)', false, 'пропущено: уже 48 КіБ надто повільні');

    // 3) Поведінка не змінилася: новий лінійний розбір дає той самий текст, що й старі вирази.
    const vast = [
      '<p>Привіт,<br>світе</p><script>bad()</script><style>p{color:red}</style><b>ok</b>', '<SCRIPT type="x">a</SCRIPT>b<script>c', 'a<style>b', '<<<a>>> x < y > z <> <',
      '1 < 2 і 3 > 2', '<p>It&#39;s &copy; &amp;amp; &lt;b&gt; &nbsp;x</p>', '<br/><br /><BR\n>regel</p>\n\n\n\n\nna', 'tekst zonder tags', '', '<', '>', '<>', '<a href="x>y">z</a>',
      '<script>één</script>tussen<script>twee</script>na<script>open', '<style><script></style>x</script>y', '<scriptx>a</scriptx>b</script>c', 'a</script>b<script>c</script>d', `<p>${EMOJI} їжак</p>\t\t x  \r\n y`,
      '<!-- c --><div\nclass="a">b</div>', 'İ<script>x</script>İ<STYLE>y</STYLE>ı',
    ];
    let zaad = 20261112; const rnd = (n: number) => { zaad = (zaad * 1103515245 + 12345) & 0x7fffffff; return zaad % n; };
    const stukken = ['<', '>', '<script', '</script>', '<style', '</style>', '<br>', '<br />', '</p>', '<p>', 'a', ' ', '\n', '\t', '&amp;', '&nbsp;', '&lt;', '/', 'SCRIPT', '<ScRiPt>', '</STYLE>', 'їжак', EMOJI, '"', '='];
    const willekeurig = Array.from({ length: 400 }, () => Array.from({ length: 1 + rnd(40) }, () => stukken[rnd(stukken.length)]).join(''));
    const afwijkend: string[] = [];
    for (const html of [...vast, ...willekeurig]) {
      const g = gmailVanHtml(html).plainText, m = microsoftVanHtml(html).plainText;
      if (g !== mailTekst.normalizeMailDisplayText(oudGmailStrip(html)) || m !== oudMicrosoftStrip(html)) afwijkend.push(JSON.stringify(html).slice(0, 80));
    }
    check(`post-01: лінійний розбір дає дослівно той самий текст, що й старі вирази (${vast.length} + ${willekeurig.length} зразків, Gmail і Microsoft)`, afwijkend.length === 0, afwijkend.slice(0, 4).join(' | '));
    const zalgo = `x${'\u0301'.repeat(200)}algo`;
    const nz = mailTekst.normalizeMailDisplayText(zalgo);
    check('post-01 (суміжне): звичайний текст із наголосами не змінюється; «залго» понад 32 знаки на літеру вкорочується; обрізання не лишає половини емодзі',
      mailTekst.normalizeMailDisplayText('e\u0301 і\u0308 ครั้ง  ') === 'e\u0301 і\u0308 ครั้ง'.normalize('NFC') && nz.startsWith('x') && nz.endsWith('algo') && nz.length <= 40
      && !eenzaam(mailTekst.normalizeMailDisplayText(`${'t'.repeat(499)}${EMOJI}`, 500)) && mailTekst.normalizeMailDisplayText(`${'t'.repeat(498)}${EMOJI}`, 500).endsWith(EMOJI), `${nz.length}`);
  }

  // ================================================================ ai-mcp-05 (чиста функція)
  {
    const b = bord as unknown as { verbindingGeweigerd?: (staat: bord.SiteStaat, vraag: { ruimte: 'prive' | 'technisch'; klant: string; methode: 'mcp' | 'token'; agentKlant?: string | null }) => { code: string } | null };
    const claudeUit: bord.SiteStaat = { agent: { claude: false }, methode: {}, cap: {} };
    const tokenUit: bord.SiteStaat = { agent: {}, methode: { token: false }, cap: {} };
    const f = b.verbindingGeweigerd;
    check('ai-mcp-05: verbindingGeweigerd — вимкнений агент/спосіб відмовляє ЧИННОМУ приватному підключенню; технічне й інші агенти — ні',
      !!f && f(claudeUit, { ruimte: 'prive', klant: 'claude', methode: 'mcp' })?.code === 'AGENT_UIT' && f(claudeUit, { ruimte: 'prive', klant: 'claude', methode: 'token' })?.code === 'AGENT_UIT'
      && f(claudeUit, { ruimte: 'technisch', klant: 'claude', methode: 'mcp' }) === null && f(claudeUit, { ruimte: 'prive', klant: 'grok', methode: 'mcp' }) === null
      && f(tokenUit, { ruimte: 'prive', klant: 'cursor', methode: 'token' })?.code === 'METHODE_UIT' && f(tokenUit, { ruimte: 'prive', klant: 'overig', methode: 'token' })?.code === 'METHODE_UIT'
      && f(tokenUit, { ruimte: 'prive', klant: 'cursor', methode: 'mcp' }) === null && f(bord.STANDAARD_STAAT, { ruimte: 'prive', klant: 'claude', methode: 'mcp' }) === null
      // connector v2: назва клієнта довільна («overig»), але адреса агента (/claude) відома — вимикач агента діє й тоді
      && f(claudeUit, { ruimte: 'prive', klant: 'overig', methode: 'mcp', agentKlant: 'claude' })?.code === 'AGENT_UIT'
      // каталог (Gemini без способів, Codex без картки) чинне підключення НЕ ріже: це робить лише явний вимикач адміністратора
      && f(bord.STANDAARD_STAAT, { ruimte: 'prive', klant: 'gemini', methode: 'mcp' }) === null && f(bord.STANDAARD_STAAT, { ruimte: 'prive', klant: 'codex', methode: 'token' }) === null);
  }

  // ---------------------------------------------------------------- Тести з базою даних
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) {
    console.log('OVERGESLAGEN (DB-integratie): geen database');
    return einde();
  }
  const sys = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const U = `sec002-g10i-a-${sfx}`;   // звичайний користувач (жертва)
  const B = `sec002-g10i-b-${sfx}`;   // переглядач журналу (support_viewer)
  const onbehandeld: string[] = [];
  const vangOnbehandeld = (e: unknown) => { onbehandeld.push(String((e as Error)?.message ?? e)); };
  process.on('unhandledRejection', vangOnbehandeld);
  try {
    await sys.query("INSERT INTO app.records (tbl, id, data) VALUES ('users', $1, $2::jsonb), ('users', $3, $4::jsonb)", [
      U, JSON.stringify({ email: `a-${sfx}@test.invalid`, name: 'A', role: 'member', status: 'approved', entitlements: ['api-platform'] }),
      B, JSON.stringify({ email: `b-${sfx}@test.invalid`, name: 'B', role: 'member', status: 'approved', entitlements: ['api-platform'] }),
    ]);
    const aantal = async (owner: string, actie: string) => Number((await sys.query('SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = $2', [owner, actie])).rows[0].n);
    const laatste = async (owner: string, actie: string) => (await sys.query('SELECT action, type, result, service, details FROM app.audit WHERE owner_id = $1 AND action = $2 ORDER BY id DESC LIMIT 1', [owner, actie])).rows[0] as { action: string; type: string; result: string; service: string | null; details: Record<string, any> } | undefined;

    // ============================================================== privacy-logboek-02 (база)
    {
      const probeer = async (details: Record<string, unknown>, extra: Partial<Parameters<typeof auditToevoegen>[0]> = {}) => {
        try { await auditToevoegen({ ownerId: U, actorId: U, action: 'owner.test.sec002', result: 'success', details, ...extra }); return ''; } catch (e) { return String((e as Error).message).slice(0, 90); }
      };
      const f0 = await probeer({ naam: 'gewoon' });
      const fNul = await probeer({ naam: 'a\u0000b' });
      const fEmoji = await probeer({ naam: `${'x'.repeat(79)}${EMOJI}`.slice(0, 80) });
      const fSleutel = await probeer({ ['k\u0000']: 1, ['s\ud83d']: 2, diep: { lijst: ['\udc00', { z: '\u0000' }] } });
      const n1 = await aantal(U, 'owner.test.sec002');
      const r1 = await laatste(U, 'owner.test.sec002');
      check('privacy-logboek-02: auditToevoegen зберігає рядок із \\u0000, обрізаним емодзі та «ворожими» ключами в details (до патча: INSERT падав)',
        !f0 && !fNul && !fEmoji && !fSleutel && n1 === 4 && r1?.details?.['k\uFFFD'] === 1 && r1?.details?.diep?.lijst?.[0] === '\uFFFD', [fNul, fEmoji, fSleutel].filter(Boolean).join(' | ') || `рядків ${n1}`);
      const fTekst = await probeer({ x: 1 }, { action: 'owner.test.sec002\u0000x', type: 'a\u0000i', result: 'succ\u0000ess', service: 'm\u0000cp' });
      const rT = await laatste(U, 'owner.test.sec002\uFFFDx');
      check('privacy-logboek-02: NUL у action/type/result/service не зриває запис (стає U+FFFD)', !fTekst && rT?.type === 'a\uFFFDi' && rT?.result === 'succ\uFFFDess' && rT?.service === 'm\uFFFDcp', fTekst);
      // details, які взагалі не серіалізуються (BigInt / цикл): рядок усе одно з'являється, з позначкою
      const kring: Record<string, unknown> = { a: 1 }; kring.zelf = kring;
      const fBig = await probeer({ n: BigInt(5) }, { action: 'owner.test.sec002.verloren' });
      const fKring = await probeer(kring, { action: 'owner.test.sec002.verloren' });
      const rV = await laatste(U, 'owner.test.sec002.verloren');
      check('privacy-logboek-02: details, що не серіалізуються, не гублять рядок — запис із позначкою _detailsVerloren', !fBig && !fKring && (await aantal(U, 'owner.test.sec002.verloren')) === 2 && rV?.details?._detailsVerloren === true, fBig || fKring);

      // шлях ШІ: саме та форма, що в backend/mcp-connector.ts (try/catch навколо auditToevoegen)
      const who = { userId: U, clientName: 'Claude', tokenId: 'tok1', ruimte: 'prive' } as Wie;
      const voorTool = await aantal(U, 'owner.mcp.tool');
      for (const args of [{ path: `/home/u/${'ab/'.repeat(30)}${EMOJI}geheim.txt` }, { path: '/home/u/\ud83d.txt' }, { path: '/home/u/gewoon.txt' }]) {
        try { await auditToevoegen({ ownerId: U, actorId: U, action: 'owner.mcp.tool', result: 'success', details: werkDetails(who, 'machine_write_file', args) }); } catch { /* як у roepTool */ }
      }
      try { await auditToevoegen({ ownerId: U, actorId: U, action: 'owner.mcp.tool', result: 'success', details: werkDetails({ ...who, clientName: `C${'c'.repeat(78)}${EMOJI}` }, `t${'t'.repeat(78)}${EMOJI}`, {}) }); } catch { /* idem */ }
      check('privacy-logboek-02: дія ШІ зі шляхом, де емодзі на межі обрізання (або самотній сурогат із JSON), лишає рядок owner.mcp.tool', (await aantal(U, 'owner.mcp.tool')) - voorTool === 4, `рядків ${(await aantal(U, 'owner.mcp.tool')) - voorTool} із 4`);

      // шлях адміністратора: journaalSchrijf / schrijfBeheerAudit із причиною 299 символів + емодзі
      const j1 = await journaal.journaalSchrijf({ actie: 'beheer.test.sec002', actor: U, eigenaar: U, reden: `${'r'.repeat(299)}${EMOJI}`, details: {} });
      const j2 = await schrijfBeheerAudit({ actor: { id: U }, eigenaar: U, doel: { soort: 'beveiliging', naam: 'rls' }, actie: 'admin.beveiliging.uit', resultaat: 'success', reden: `${'р'.repeat(299)}${EMOJI}`, voor: { stand: 'aan' }, na: { stand: 'uit' } });
      const rJ = await laatste(U, 'admin.beveiliging.uit');
      check('privacy-logboek-02: вимкнення захисту з причиною «299 символів + емодзі» записується (journaalSchrijf не повертає null), причина без половини емодзі',
        j1 !== null && j2 !== null && typeof rJ?.details?.reden === 'string' && !eenzaam(rJ.details.reden) && !rJ.details.reden.includes('\uFFFD') && rJ.details.reden.length <= 300, `j1=${j1 ? 'ok' : 'null'} j2=${j2 ? 'ok' : 'null'}`);
      const keten = await auditControle(U);
      check('privacy-logboek-02: геш-ланцюг акаунта після всіх цих рядків цілий', keten.geldig && keten.totaal >= 11, JSON.stringify(keten));

      const consoleBron = lees('backend/mcp-console.ts');
      const stuk = consoleBron.slice(consoleBron.indexOf('"POST /api/mcp/tokens": ['), consoleBron.indexOf('"POST /api/mcp/tokens/revoke"'));
      check('privacy-logboek-02: випуск токена ШІ (tvh_) без рядка журналу неможливий — запис mcp_console_token_issued більше не ковтається (.catch)',
        stuk.includes('mcp_console_token_issued') && !/mcp_console_token_issued[^\n]*\.catch\(\(\) => undefined\)/.test(stuk) && stuk.includes('JOURNAAL_NIET_BESCHIKBAAR'));
    }

    // ============================================================== privacy-logboek-06: db.add і обрізаний емодзі
    {
      const basis = { recipientUserId: U, recipientEmail: '', kind: 'info', message: 'x', read: false, createdAt: Date.now() };
      const idsGewoon = await db.add('site_notifications', [{ ...basis, title: 'gewoon' }]);
      const idsEmoji = await db.add('site_notifications', [{ ...basis, title: `${'t'.repeat(219)}${EMOJI}`.slice(0, 220) }, { ...basis, title: 'tweede', ['sleutel\ud83d']: 'x\u0000y' }]);
      const rijen = (await sys.query("SELECT data FROM app.records WHERE tbl = 'site_notifications' AND data->>'recipientUserId' = $1", [U])).rows.map((r) => r.data as Record<string, string>);
      check('privacy-logboek-06: db.add зберігає запис із заголовком, обрізаним посеред емодзі (U+FFFD), і з «ворожим» ключем — не повертає мовчки null',
        idsGewoon[0] !== null && idsEmoji.length === 2 && idsEmoji.every((x) => typeof x === 'string') && rijen.length === 3 && rijen.some((r) => r.title?.endsWith('\uFFFD') && r.title.length === 220) && rijen.some((r) => r['sleutel\uFFFD'] === 'x\uFFFDy'),
        `повернуто ${JSON.stringify(idsEmoji.map((x) => (x ? 'id' : null)))}, рядків ${rijen.length}`);
      const dbBron = lees('server/platform/db.ts');
      check('privacy-logboek-06: запасний шлях db.add більше не ковтає помилку мовчки (журнал із таблицею й кодом)', /\[db\.add\] record geweigerd/.test(dbBron));
    }

    // ============================================================== ai-mcp-05: чинне підключення і вимикач сайту
    {
      const who = { userId: U, clientName: 'Claude', tokenId: randomUUID(), ruimte: 'prive' } as Wie;
      const tok = { userId: U, clientName: 'Cursor', agentTokenId: randomUUID(), grantId: 'token:x', ruimte: 'prive' } as Wie;
      vergeetStaat();
      const voorLijst = (await lijstTools(who)).length;
      await zetStaat('agent:claude', false, 'test');
      try {
        const lijst = await lijstTools(who);
        const uit = await roepTool(who, 'mcp_board_list', {});
        const r = await laatste(U, 'owner.mcp.tool');
        check('ai-mcp-05: агент вимкнено для всього сайту → ЧИННИЙ грант не бачить інструментів і tools/call відмовляє AGENT_UIT (із записом у журнал)',
          voorLijst > 0 && lijst.length === 0 && uit.isError === true && /AGENT_UIT/.test(uit.content?.[0]?.text || '') && r?.result === 'denied' && r?.details?.reden === 'AGENT_UIT',
          `до: ${voorLijst}, після: ${lijst.length}, відповідь: ${(uit.content?.[0]?.text || '').slice(0, 60)}`);
        const tech = await roepTool({ ...who, ruimte: 'prive', clientName: 'Grok' }, 'mcp_board_list', {});
        check('ai-mcp-05: інший агент (Grok) при цьому працює далі', !/AGENT_UIT|METHODE_UIT/.test(tech.content?.[0]?.text || ''));
        // connector v2: довільна назва клієнта, але адреса агента /claude
        const v2 = await roepTool({ userId: U, clientName: 'Mijn eigen client', tokenId: randomUUID(), ruimte: 'prive', agent: 'claude' } as Wie, 'mcp_board_list', {});
        check('ai-mcp-05: підключення через адресу агента /claude з довільною назвою клієнта теж зупинено', /AGENT_UIT/.test(v2.content?.[0]?.text || ''));
      } finally { await zetStaat('agent:claude', true, 'test'); }
      await zetStaat('methode:token', false, 'test');
      try {
        const lijst = await lijstTools(tok);
        const uit = await roepTool(tok, 'mcp_board_list', {});
        const oauth = await roepTool(who, 'mcp_board_list', {});
        check('ai-mcp-05: спосіб «токен» вимкнено → чинний токен tvh_ зупинено (METHODE_UIT), а OAuth-грант працює',
          lijst.length === 0 && /METHODE_UIT/.test(uit.content?.[0]?.text || '') && !/AGENT_UIT|METHODE_UIT/.test(oauth.content?.[0]?.text || ''), (uit.content?.[0]?.text || '').slice(0, 60));
      } finally { await zetStaat('methode:token', true, 'test'); vergeetStaat(); }
      const consoleBron = lees('backend/mcp-console.ts');
      const agentRoute = consoleBron.slice(consoleBron.indexOf('"POST /api/mcp/agent": ['));
      check('ai-mcp-05: пряма адреса токена /api/mcp/agent теж питає стелю сайту (verbindingGeweigerd) перед виконанням', /verbindingGeweigerd\(/.test(agentRoute.slice(0, agentRoute.indexOf('runTool('))));

      // toets-g10i №2: відмова SITE_CAP на /api/mcp/agent — поведінково, і з рядком owner.mcp.tool/denied у геш-ланцюгу (не лише logCall).
      const ruwToken = `tvh_${randomBytes(24).toString('base64url')}`; // вигаданий
      await sys.query("INSERT INTO app.mcp_console_tokens (user_id, name, prefix, token_hash, expires_at, ruimte) VALUES ($1, 'Robot sec002', $2, $3, now() + interval '1 day', 'prive')",
        [U, ruwToken.slice(0, 12), createHash('sha256').update(ruwToken).digest('hex')]);
      const consoleRoutes = mcpConsoleRoutes((async () => ({ errorCode: 'GEEN' })) as never);
      const roepAgent = async () => {
        const res = await consoleRoutes['POST /api/mcp/agent'][0]({ event: { headers: { authorization: `Bearer ${ruwToken}` } }, body: { name: 'list_tasks', arguments: {} } } as never) as { statusCode: number; body: string };
        return { status: res.statusCode, body: String(res.body || '') };
      };
      const telDenied = async () => Number((await sys.query("SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = 'owner.mcp.tool' AND result = 'denied'", [U])).rows[0].n);
      vergeetStaat();
      const voorDenied = await telDenied();
      await zetStaat('methode:token', false, 'test');
      let antwoord = { status: 0, body: '' };
      try { antwoord = await roepAgent(); } finally { await zetStaat('methode:token', true, 'test'); vergeetStaat(); }
      const naDenied = await telDenied();
      const rDenied = await laatste(U, 'owner.mcp.tool');
      check('toets-g10i №2: /api/mcp/agent при вимкненому способі «токен» → 403 SITE_CAP:METHODE_UIT і рядок owner.mcp.tool/denied у журналі (геш-ланцюг)',
        antwoord.status === 403 && antwoord.body.includes('METHODE_UIT') && naDenied - voorDenied === 1 && rDenied?.result === 'denied' && rDenied?.details?.reden === 'METHODE_UIT' && rDenied?.details?.transport === 'agent',
        `status ${antwoord.status}, рядків denied +${naDenied - voorDenied}`);
    }

    // ============================================================== privacy-logboek-05: журнал адміністрування і приватні подробиці
    {
      const who = { userId: U, clientName: 'Claude', tokenId: 'tok1', ruimte: 'prive' } as Wie;
      const GEHEIM_PAD = `/home/a/Documenten/medisch-${sfx}.pdf`;
      await auditToevoegen({ ownerId: U, actorId: U, action: 'owner.mcp.tool', type: 'ai', result: 'success', details: { ...werkDetails(who, 'machine_read_file', { path: GEHEIM_PAD }), token: 'verzonnen-geheim' } });
      await auditToevoegen({ ownerId: U, actorId: U, action: 'owner.mcp.tool', type: 'ai', result: 'success', details: werkDetails({ ...who, ruimte: 'technisch' }, 'machine_read_file', { path: `/srv/technisch-${sfx}.log` }) });
      await auditToevoegen({ ownerId: B, actorId: B, action: 'owner.mcp.tool', type: 'ai', result: 'success', details: werkDetails({ ...who, userId: B }, 'machine_read_file', { path: `/home/b/eigen-${sfx}.txt` }) });
      await auditToevoegen({ ownerId: U, actorId: B, action: 'owner.admin.role.updated', result: 'success', details: { doel: { soort: 'account', id: U, naam: `a-${sfx}@test.invalid` }, reden: 'beheer' } });

      const stapOpAanroepen: string[] = []; let stapOpOk = false; const gelogd: Array<{ actie: string; details?: Record<string, unknown> }> = [];
      const maak = (rol: string, kijker: string) => beheerJournaalRoutes({
        adminContext: async () => ({ user: { id: kijker }, adminRole: rol }),
        ownerAudit: async (_u: string, actie: string, _r: string, details?: Record<string, unknown>) => { gelogd.push({ actie, details }); },
        ownerBody: (b: unknown) => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>,
        ownerResponse: (data: unknown, status = 200) => ({ status, data }),
        error: (code: string, status = 400, extra?: Record<string, unknown>) => ({ status, data: { error: code, ...(extra || {}) } }),
        personen: async () => new Map(), zoekPersonen: async () => [],
        safeDetails: (v: unknown): unknown => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !/(token|secret|cookie|proof|nonce|pkce|authorization|password)/i.test(k))) : v),
        stepUp: async (_ctx: unknown, auth: { user: { id: string } }) => { stapOpAanroepen.push(auth.user.id); return stapOpOk ? null : { status: 403, data: { error: 'STEP_UP_REQUIRED' } }; },
      } as never) as unknown as Record<string, Array<(ctx: unknown) => Promise<{ status: number; data: any }>>>;
      const zoek = async (rol: string, kijker: string, body: Record<string, unknown> = {}) => (await maak(rol, kijker)['POST /api/owner/journaal/beheer/zoeken'][0]({ event: {}, body: { q: sfx, verbergRuis: false, limiet: 100, ...body } })).data as { items: Array<Record<string, any>> };

      const alsSupport = await zoek('support_viewer', B);
      const tekstSupport = JSON.stringify(alsSupport.items);
      const eigenB = alsSupport.items.find((i) => i.ownerId === B && i.action === 'owner.mcp.tool');
      const priveA = alsSupport.items.find((i) => i.ownerId === U && i.action === 'owner.mcp.tool' && i.details?.ruimte !== 'technisch');
      check('privacy-logboek-05: support_viewer НЕ бачить doel (шлях файлу) приватної дії ШІ іншого користувача; рядок, дія, результат і акаунт лишаються',
        alsSupport.items.length >= 4 && !tekstSupport.includes(GEHEIM_PAD) && !!priveA && priveA.result === 'success' && priveA.details?._priveVerborgen === true && priveA.details?.tool === 'machine_read_file',
        tekstSupport.includes(GEHEIM_PAD) ? 'шлях видно' : `рядків ${alsSupport.items.length}`);
      check('privacy-logboek-05: власні приватні рядки, технічна сфера й адміністративні дії показуються повністю, як раніше',
        eigenB?.details?.doel === `/home/b/eigen-${sfx}.txt` && tekstSupport.includes(`/srv/technisch-${sfx}.log`) && alsSupport.items.some((i) => i.action === 'owner.admin.role.updated' && i.doel?.naam === `a-${sfx}@test.invalid`));
      // пошук не має ставати підказкою: слово з прихованого шляху не знаходить рядок для support_viewer, а власник знаходить
      const orakel = await zoek('support_viewer', B, { q: `medisch-${sfx}` });
      const orakelEigenaar = await zoek('super_admin', B, { q: `medisch-${sfx}` });
      const statRoute = async (rol: string) => (await maak(rol, B)['POST /api/owner/journaal/beheer/statistiek'][0]({ event: {}, body: { q: `medisch-${sfx}`, verbergRuis: false } })).data as { totaal: number };
      check('privacy-logboek-05: пошук і статистика за словом із прихованих подробиць нічого не видають support_viewer (без «оракула»); власник знаходить',
        orakel.items.length === 0 && orakelEigenaar.items.length === 1 && (await statRoute('support_viewer')).totaal === 0 && (await statRoute('super_admin')).totaal === 1, `${orakel.items.length}/${orakelEigenaar.items.length}`);
      const alsBeveiliging = JSON.stringify((await zoek('security_admin', B)).items);
      const alsEigenaar = JSON.stringify((await zoek('super_admin', B)).items);
      check('privacy-logboek-05: security_admin — так само приховано; власник (super_admin) бачить як раніше, але без ключів-секретів', !alsBeveiliging.includes(GEHEIM_PAD) && alsEigenaar.includes(GEHEIM_PAD) && !alsEigenaar.includes('verzonnen-geheim'));

      // експорт: підтвердження входу + ліміт + ті самі маски і фільтр секретів
      const exporteer = async (rol: string, kijker: string, formaat: string) => maak(rol, kijker)['POST /api/owner/journaal/beheer/export'][0]({ event: {}, body: { q: sfx, verbergRuis: false, formaat } });
      stapOpOk = false; stapOpAanroepen.length = 0; gelogd.length = 0;
      const zonderStap = await exporteer('support_viewer', B, 'json');
      check('privacy-logboek-05: експорт без свіжого підтвердження входу → 403 STEP_UP_REQUIRED, нічого не віддано й не «експортовано»',
        zonderStap.status === 403 && stapOpAanroepen.length === 1 && !JSON.stringify(zonderStap.data).includes('inhoud') && !gelogd.some((g) => g.actie === 'owner.admin.audit.exported'));
      stapOpOk = true;
      const metStap = await exporteer('support_viewer', B, 'json');
      const csv = await exporteer('support_viewer', B, 'csv');
      const eig = await exporteer('super_admin', B, 'json');
      check('privacy-logboek-05: JSON- і CSV-експорт для support_viewer без приватного шляху й без ключів-секретів; власник — повний, теж без секретів',
        metStap.status === 200 && typeof metStap.data?.inhoud === 'string' && !metStap.data.inhoud.includes(GEHEIM_PAD) && !metStap.data.inhoud.includes('verzonnen-geheim') && metStap.data.inhoud.includes(`/home/b/eigen-${sfx}.txt`)
        && csv.status === 200 && !String(csv.data?.inhoud).includes(GEHEIM_PAD)
        && eig.status === 200 && String(eig.data?.inhoud).includes(GEHEIM_PAD) && !String(eig.data?.inhoud).includes('verzonnen-geheim'), `status ${metStap.status}/${csv.status}/${eig.status}`);
      // ліміт: 5 на годину на людину (failClosed) — тут уже 3 вдалі, ще 2 проходять, шоста — 429
      const restVolledig = [await exporteer('support_viewer', B, 'csv'), await exporteer('support_viewer', B, 'csv'), await exporteer('support_viewer', B, 'csv')];
      const rest = restVolledig.map((r) => r.status);
      check('privacy-logboek-05: шостий експорт за годину від тієї самої людини → 429 RATE_LIMITED', rest[0] === 200 && rest[1] === 200 && rest[2] === 429, rest.join(','));
      const ketenRoute = maak('support_viewer', `${B}-keten`)['POST /api/owner/journaal/beheer/ketencontrole'][0];
      const ketenStatussen: number[] = [];
      const ketenAntwoorden: any[] = [];
      for (let i = 0; i < 8; i++) { const r = await ketenRoute({ event: {}, body: {} }); ketenAntwoorden.push(r); ketenStatussen.push(r.status); }
      check('privacy-logboek-05: повна перевірка ланцюгів (важка) обмежена за частотою: 6 на годину, далі 429', ketenStatussen.filter((s) => s === 200).length === 6 && ketenStatussen[6] === 429 && ketenStatussen[7] === 429, ketenStatussen.join(','));
      // toets-g10i №3: відмова через ліміт каже, ЧЕРЕЗ СКІЛЬКИ можна знову (retryAfter → заголовок Retry-After у platform error), а не просто «не вдалося».
      check('toets-g10i №3: 429 експорту й перевірки ланцюгів несе retryAfter (секунди до наступної спроби)',
        Number(restVolledig[2]?.data?.retryAfter) > 0 && Number(ketenAntwoorden[6]?.data?.retryAfter) > 0, `${restVolledig[2]?.data?.retryAfter}/${ketenAntwoorden[6]?.data?.retryAfter}`);
      const indexBron = lees('backend/index.ts');
      const lijstRoute = indexBron.slice(indexBron.indexOf("'POST /api/owner/audit/beheer/lijst'"), indexBron.indexOf("'POST /api/owner/audit/beheer/verwijderen'"));
      check('privacy-logboek-05: стара адреса /api/owner/audit/beheer/lijst маскує так само, а маршрути журналу отримали stepUp',
        /maskeerDetailsVoorKijker\(/.test(lijstRoute) && /beheerJournaalRoutes\(\{[\s\S]{0,400}stepUp: stapOpVereist/.test(indexBron));
    }

    // ============================================================== ai-mcp-03 / keten-config-03: одне повідомлення WS
    {
      const agent = await store.createAgent(U, 'pc-sec002', 'linux', sha256(randomUUID()), {});
      const verbind = async (extra: Record<string, unknown> = {}) => {
        const ws = new NepWs();
        onConnection(ws as never);
        ws.emit('message', Buffer.from(JSON.stringify({ t: 'auth', ticket: issueWsTicket(agent.id).ticket, version: '0.8.0', ...extra })));
        for (let i = 0; i < 40 && !ws.verstuurd.some((s) => s.includes('"ready"') || s.startsWith('CLOSE')); i++) await wacht(50);
        return ws;
      };
      onbehandeld.length = 0;
      const ws = await verbind();
      const klaar = ws.verstuurd.some((s) => s.includes('"ready"'));
      ws.emit('message', Buffer.from(JSON.stringify({ t: 'result', id: 'geen-uuid', ok: true, data: {} })));
      ws.emit('message', Buffer.from(JSON.stringify({ t: 'result', id: 'x', ok: false, error: 'e' })));
      await wacht(400);
      check('ai-mcp-03 / keten-config-03: {t:"result", id:"не-uuid"} від спареного агента НЕ дає необробленого відхилення (до патча: процес сервера завершувався)',
        klaar && onbehandeld.length === 0, onbehandeld.join(' | ').slice(0, 160));

      // справжня команда у стані 'sent' + результат із \u0000 і самотнім сурогатом: команда закривається, процес живий
      const cmd = await store.createCommand(agent.id, U, 'sys.info', {}, 'approved') as { id: string };
      await store.transitionCommand(cmd.id, ['approved'], 'sent', undefined, U, agent.id);
      onbehandeld.length = 0;
      ws.emit('message', Buffer.from(JSON.stringify({ t: 'result', id: cmd.id, ok: true, data: { uitvoer: 'a\u0000b', ['k\u0000']: '\ud83d' } })));
      await wacht(400);
      const na = (await sys.query('SELECT status, result FROM app.agent_commands WHERE id = $1', [cmd.id])).rows[0] as { status: string; result: any };
      check('keten-config-03: результат команди з \\u0000 у даних — без необробленого відхилення; команда закрита або з\'єднання закрито кодом 1011 (процес живий)',
        onbehandeld.length === 0 && (na?.status === 'succeeded' || na?.status === 'failed' || ws.verstuurd.some((s) => s.startsWith('CLOSE 1011'))), `${na?.status}; ${onbehandeld.join(' | ').slice(0, 120)}`);
      ws.emit('close');

      // версія / можливості з \u0000 у кадрі auth і в pong
      onbehandeld.length = 0;
      const ws2 = await verbind({ version: '0.8\u0000.1', capabilities: { naam: 'x\u0000y', ['k\ud83d']: 1 } });
      ws2.emit('message', Buffer.from(JSON.stringify({ t: 'pong', version: 'v\u0000', capabilities: { a: '\u0000' } })));
      await wacht(400);
      check('keten-config-03: version/capabilities з \\u0000 у кадрах auth і pong — без необробленого відхилення; з\'єднання або готове, або закрите',
        onbehandeld.length === 0 && ws2.verstuurd.some((s) => s.includes('"ready"') || s.startsWith('CLOSE')), onbehandeld.join(' | ').slice(0, 160));
      ws2.emit('close');
      await wacht(100);

      // toets-g10i №1: ЗАКОННИЙ результат із емодзі на межі обрізання (довга помилка docker/exec) або з обрізаним виводом
      // (самотній сурогат у data) — команда закривається failed/succeeded, з'єднання агента НЕ рветься (без CLOSE 1011).
      {
        onbehandeld.length = 0;
        const ws3 = await verbind();
        const cmdFout = await store.createCommand(agent.id, U, 'sys.info', {}, 'approved') as { id: string };
        const cmdData = await store.createCommand(agent.id, U, 'sys.info', {}, 'approved') as { id: string };
        await store.transitionCommand(cmdFout.id, ['approved'], 'sent', undefined, U, agent.id);
        await store.transitionCommand(cmdData.id, ['approved'], 'sent', undefined, U, agent.id);
        ws3.emit('message', Buffer.from(JSON.stringify({ t: 'result', id: cmdFout.id, ok: false, error: `${'e'.repeat(499)}😀 docker: daarna nog tekst` })));
        await wacht(300);
        ws3.emit('message', Buffer.from(JSON.stringify({ t: 'result', id: cmdData.id, ok: true, data: { stdout: `${'o'.repeat(20)}\ud83d`, ['s\udc00']: 1 } })));
        await wacht(400);
        const st = async (id: string) => (await sys.query('SELECT status, result FROM app.agent_commands WHERE id = $1', [id])).rows[0] as { status: string; result: any };
        const f = await st(cmdFout.id); const d = await st(cmdData.id);
        const fout = String(f?.result?.error ?? '');
        check('toets-g10i №1: помилка 499 знаків + емодзі й data з самотнім сурогатом — команди закриті (failed/succeeded), з\'єднання агента не розірвано (без CLOSE 1011)',
          f?.status === 'failed' && d?.status === 'succeeded' && !ws3.verstuurd.some((s) => s.startsWith('CLOSE')) && onbehandeld.length === 0
            && fout.length <= 500 && !/[\uD800-\uDBFF]$/.test(fout) && String(d?.result?.data?.stdout ?? '').endsWith('�'),
          `${f?.status}/${d?.status}; ${ws3.verstuurd.filter((s) => s.startsWith('CLOSE')).join(',')}; ${fout.length}`);
        ws3.emit('close');
        await wacht(100);
      }

      const gw = lees('backend/connectors-gateway.ts');
      const handler = gw.slice(gw.indexOf("ws.on('message'"), gw.indexOf("ws.on('close'"));
      const helper = gw.slice(gw.indexOf('const bijBericht'), gw.indexOf("ws.on('close'"));
      check('ai-mcp-03: кожне відхилення обробника повідомлень шлюзу ловиться (.catch або try/catch), а id результату перевіряється як UUID до запиту в базу',
        /catch\s*\(/.test(handler || helper) && (/isOpdrachtId\(msg\.id\)/.test(gw) || /\[0-9a-f\]\{8\}-/.test(gw)));
      const start = lees('server/start.ts');
      const vangnet = (() => { try { return lees('server/platform/proces-vangnet.ts'); } catch { return ''; } })();
      check('ai-mcp-03 / keten-config-03: процес має глобальний запобіжник unhandledRejection / uncaughtException (server/start.ts)',
        /process\.on\('unhandledRejection'/.test(start + vangnet) && /process\.on\('uncaughtException'/.test(start + vangnet) && (/procesVangnetInstellen\(\)/.test(start) || /process\.on\('unhandledRejection'/.test(start)));
    }
  } finally {
    process.off('unhandledRejection', vangOnbehandeld);
    await sys.query("DELETE FROM app.ai_site_schakelaars WHERE gewijzigd_door = 'test'").catch(() => undefined);
    vergeetStaat();
    await sys.query('DELETE FROM app.agent_commands WHERE user_id = ANY($1::text[])', [[U, B]]).catch(() => undefined);
    await sys.query('DELETE FROM app.agents WHERE user_id = ANY($1::text[])', [[U, B]]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'site_notifications' AND data->>'recipientUserId' = ANY($1::text[])", [[U, B]]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1::text[])", [[U, B]]).catch(() => undefined);
  }

  return einde();
}
