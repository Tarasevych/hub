// ORCH-001 етап 0: scripts/orch/kern.mjs — політика, lock, адаптери, задачі, свіжість, компактний контекст, підпис власника.
// Тест перевіряє поведінку (що саме відхиляється й чому), а не лише наявність файлів.
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import * as k from '../../scripts/orch/kern.mjs';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');

/** Емулює `ssh-keygen -Y sign` (SSHSIG v1, ed25519, sha512) — так підписує власник на своєму ПК. */
function sshSign(priv: import('node:crypto').KeyObject, pubRaw: Buffer, namespace: string, bericht: string) {
  const s = (b: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(b.length); return Buffer.concat([l, b]); };
  const pub = Buffer.concat([s(Buffer.from('ssh-ed25519')), s(pubRaw)]);
  const ruw = cryptoSign(null, k.sshsigGegevens(namespace, Buffer.from(bericht)), priv);
  const sig = Buffer.concat([s(Buffer.from('ssh-ed25519')), s(ruw)]);
  const v = Buffer.alloc(4); v.writeUInt32BE(1);
  const blob = Buffer.concat([Buffer.from('SSHSIG'), v, s(pub), s(Buffer.from(namespace)), s(Buffer.alloc(0)), s(Buffer.from('sha512')), s(sig)]);
  return { handtekening: `-----BEGIN SSH SIGNATURE-----\n${blob.toString('base64').match(/.{1,70}/g)!.join('\n')}\n-----END SSH SIGNATURE-----\n`, pubRegel: `ssh-ed25519 ${pub.toString('base64')}` };
}
function sleutelpaar() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string };
  return { priv: privateKey, pubRaw: Buffer.from(jwk.x, 'base64url') };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('orch-kern');
  const beleid = JSON.parse(lees('orchestratie/beleid.json'));
  const bestanden = Object.fromEntries(beleid.regelBestanden.map((p: string) => [p, lees(p)]));

  // — beleid.json —
  check('чинний beleid.json валідний', k.valideerBeleid(beleid).length === 0, JSON.stringify(k.valideerBeleid(beleid)));
  const codes = (b: unknown) => k.valideerBeleid(b).map((z: { code: string }) => z.code);
  check('базовий commit не 40 hex → BASIS_COMMIT', codes({ ...beleid, basis: { ...beleid.basis, bronCommit: 'b279cca' } }).includes('BASIS_COMMIT'));
  check('приватні ключі агентам = true → SLEUTELS (заборона жорстка)', codes({ ...beleid, kritiek: { ...beleid.kritiek, privesleutelsNaarAgenten: true } }).includes('SLEUTELS'));
  check('невідомий режим встановлення → MODI_ONGELDIG', codes({ ...beleid, kritiek: { ...beleid.kritiek, installatieModi: { toegestaan: ['handmatig', 'root-direct'] } } }).includes('MODI_ONGELDIG'));
  check('адаптер може мати макс. 60 рядків (не окремий звід правил)', codes({ ...beleid, adapters: { ...beleid.adapters, maxRegels: 500 } }).includes('ADAPTER_MAX'));
  check('агент з великими літерами → AGENT_ID', codes({ ...beleid, agenten: [{ id: 'Claude', kanalen: ['zip'] }] }).includes('AGENT_ID'));
  check('усі 8 агентів зареєстровані з каналами', ['claude', 'antigravity', 'chatgpt', 'codex', 'grok', 'copilot', 'gemini', 'cursor'].every((id) => beleid.agenten.some((a: { id: string; kanalen: string[] }) => a.id === id && a.kanalen.length)));
  check('усі 8 каналів прийому з ТЗ присутні', ['github_pr', 'mcp', 'http_api', 'lokaal_bestand', 'zip', 'tar_gz', 'git_patch', 'web_upload'].every((c) => beleid.inlevering.kanalen.includes(c)));
  check('статуси installed/integrated/in_progress/released розрізняються', k.STATUSSEN.length === 4 && ['installed', 'integrated', 'in_progress', 'released'].every((s) => k.STATUSSEN.includes(s)));
  check('автоматичний режим зараз НЕ дозволений (потрібна окрема політика)', !beleid.kritiek.installatieModi.toegestaan.includes('automatisch_beperkt') && beleid.kritiek.installatieModi.automatischBeperkt === null);

  // — lock / версіонування —
  const r1 = k.vergrendel(beleid, bestanden, null);
  check('vergrendel без попереднього lock → lock з hash і kritiekHash', !!r1.lock && /^[0-9a-f]{64}$/.test(r1.lock.hash) && /^[0-9a-f]{64}$/.test(r1.lock.kritiekHash) && r1.lock.eigenaar === null);
  const lock = JSON.parse(lees('orchestratie/regels.lock.json'));
  check('закомічений regels.lock.json відповідає файлам правил', k.controleerLock(beleid, bestanden, lock).length === 0, JSON.stringify(k.controleerLock(beleid, bestanden, lock)));
  const gewijzigd = { ...bestanden, 'AGENTS.md': bestanden['AGENTS.md'] + '\n## Нове правило\n' };
  const c1 = k.controleerLock(beleid, gewijzigd, lock);
  check('AGENTS.md змінено без lock → REGELS_NIET_VERGRENDELD з назвою файла', c1.some((z: { code: string; bestanden?: string[] }) => z.code === 'REGELS_NIET_VERGRENDELD' && z.bestanden?.includes('AGENTS.md')));
  check('зміна правил без підвищення regelsVersie → VERSIE_NIET_VERHOOGD', k.vergrendel(beleid, gewijzigd, lock).fout?.code === 'VERSIE_NIET_VERHOOGD');
  check('зміна правил з вищою версією → новий lock', !!k.vergrendel({ ...beleid, regelsVersie: '9.0.0' }, gewijzigd, lock).lock);
  check('CRLF і LF дають той самий відбиток (Windows ≡ Linux)', k.regelsAfdruk({ a: 'x\r\ny\r\n' }).hash === k.regelsAfdruk({ a: 'x\ny\n' }).hash);
  check('зміна некритичного поля не змінює kritiekHash', k.kritiekAfdruk({ ...beleid, adapters: { ...beleid.adapters, maxRegels: 30 } }) === k.kritiekAfdruk(beleid));
  check('зміна режиму встановлення змінює kritiekHash', k.kritiekAfdruk({ ...beleid, kritiek: { ...beleid.kritiek, installatieModi: { toegestaan: ['handmatig'] } } }) !== k.kritiekAfdruk(beleid));

  // — підпис власника —
  const { priv, pubRaw } = sleutelpaar();
  const bericht = k.kritiekBericht(lock);
  const { handtekening, pubRegel } = sshSign(priv, pubRaw, k.REGELS_NAMESPACE, bericht);
  const toegestaan = `eigenaar namespaces="mijn-ruimte-regels" ${pubRegel}\n`;
  check('справжній SSHSIG власника → ok + відбиток ключа', k.verifieerSshsig({ handtekening, bericht, namespace: k.REGELS_NAMESPACE, toegestaan }).ok === true);
  check('ключ не в eigenaar-ondertekenaars → відмова', k.verifieerSshsig({ handtekening, bericht, namespace: k.REGELS_NAMESPACE, toegestaan: '# leeg\n' }).ok === false);
  check('підпис у namespace випуску (mijn-ruimte-uitrol) не є підписом правил', k.verifieerSshsig({ handtekening: sshSign(priv, pubRaw, 'mijn-ruimte-uitrol', bericht).handtekening, bericht, namespace: k.REGELS_NAMESPACE, toegestaan }).ok === false);
  check('підпис під іншим kritiekHash не підходить', k.verifieerSshsig({ handtekening, bericht: bericht.replace(/kritiekHash=.*/, 'kritiekHash=' + 'f'.repeat(64)), namespace: k.REGELS_NAMESPACE, toegestaan }).ok === false);
  check('ключ агента (інша пара) → відмова', (() => { const a = sleutelpaar(); return k.verifieerSshsig({ handtekening: sshSign(a.priv, a.pubRaw, k.REGELS_NAMESPACE, bericht).handtekening, bericht, namespace: k.REGELS_NAMESPACE, toegestaan }).ok === false; })());
  check('без підпису: критичні політики = «пропозиція» (попередження, не помилка)', k.eigenaarStatus(lock, null)?.code === 'KRITIEK_NIET_BEVESTIGD' && k.eigenaarStatus(lock, null)?.ernst === 'waarschuwing');
  check('критичні політики змінено після підпису → KRITIEK_GEWIJZIGD (помилка)', k.eigenaarStatus({ ...lock, eigenaar: { kritiekHash: 'a'.repeat(64) } }, null)?.code === 'KRITIEK_GEWIJZIGD');
  check('підписано й відбиток збігається → без зауважень', k.eigenaarStatus({ ...lock, eigenaar: { kritiekHash: lock.kritiekHash } }, { ok: true }) === null);
  check('у репозиторії немає приватного ключа власника', !/PRIVATE KEY/.test(lees('orchestratie/eigenaar-ondertekenaars')) && !existsSync('orchestratie/eigenaar-sleutel'));

  // — адаптери —
  const adapters = beleid.adapters.bestanden.filter((p: string) => existsSync(p));
  check('усі зареєстровані адаптери існують (8)', adapters.length === 8, adapters.join(','));
  check('кожен адаптер: маркер, посилання на AGENTS.md, ≤ maxRegels', adapters.every((p: string) => k.controleerAdapter(p, lees(p), beleid.adapters.maxRegels).length === 0));
  check('CLAUDE.md згадує id «claude», GEMINI.md — «gemini»', /`claude`/.test(lees('CLAUDE.md')) && /`gemini`/.test(lees('GEMINI.md')));
  const lang = `<!-- orch-adapter -->\nAGENTS.md\n${'regel\n'.repeat(40)}`;
  check('довгий адаптер → ADAPTER_TE_LANG', k.controleerAdapter('X.md', lang, 25).some((z: { code: string }) => z.code === 'ADAPTER_TE_LANG'));
  check('адаптер із власним «Правило 1» → ADAPTER_REGELS', k.controleerAdapter('X.md', '<!-- orch-adapter -->\nAGENTS.md\n## Правило 1\n', 25).some((z: { code: string }) => z.code === 'ADAPTER_REGELS'));
  check('адаптер без посилання на AGENTS.md → ADAPTER_VERWIJZING', k.controleerAdapter('X.md', '<!-- orch-adapter -->\nhoi\n', 25).some((z: { code: string }) => z.code === 'ADAPTER_VERWIJZING'));

  // — компактний контекст —
  const ctx = k.compacteContext(lees('AGENTS.md'), beleid, lock);
  check('компактний контекст містить версію правил, hash, базу і 6 compact-розділів', ctx.includes(lock.hash) && ctx.includes(beleid.basis.bronCommit) && (ctx.match(/^## /gm) || []).length === 6);
  check('компактний контекст ≤ maxBytes і збігається з закоміченим файлом', Buffer.byteLength(ctx) <= beleid.compactContext.maxBytes && lees(beleid.compactContext.bestand) === ctx);
  check('компактний контекст чесно каже, що власник ще не підтвердив', ctx.includes('НЕ підтверджено власником'));
  check('AGENTS.md не містить розділу «Правило N» поза compact-блоками, що суперечить адаптерам', !/^## Правило \d/m.test(lees('AGENTS.md')));

  // — задачі —
  const taak = JSON.parse(lees('orchestratie/taken/ORCH-001.json'));
  check('ORCH-001 зареєстрована й валідна', k.valideerTaak(taak, beleid).length === 0 && taak.basisCommit === beleid.basis.bronCommit, JSON.stringify(k.valideerTaak(taak, beleid)));
  const tc = (t: unknown) => k.valideerTaak(t, beleid).map((z: { code: string }) => z.code);
  check('гілка без часової мітки → TAAK_TAK', tc({ ...taak, tak: 'feature/orch-001' }).includes('TAAK_TAK'));
  check('гілка voornaamst → TAAK_TAK (не можна працювати в default)', tc({ ...taak, tak: 'voornaamst' }).includes('TAAK_TAK'));
  check('Task ID «orch1» → TAAK_ID', tc({ ...taak, id: 'orch1' }).includes('TAAK_ID'));
  check('незареєстрований агент → попередження TAAK_AGENT_ONBEKEND', k.valideerTaak({ ...taak, agent: 'nieuwe-ai' }, beleid).some((z: { code: string; ernst: string }) => z.code === 'TAAK_AGENT_ONBEKEND' && z.ernst === 'waarschuwing'));
  check('невідомий статус → TAAK_STAAT', tc({ ...taak, staat: 'klaar' }).includes('TAAK_STAAT'));

  // — свіжість перед початком і перед передаванням —
  const basis = { taak, regelsVersie: beleid.regelsVersie, regelsHash: lock.hash, headIsAfstammeling: true, integratieVoorsprong: [], eigenBestanden: ['src/a.ts'], schoon: true, fase: 'overdracht' };
  const vc = (f: unknown) => k.versheid(f).map((z: { code: string }) => z.code);
  check('усе свіже → без зауважень', k.versheid(basis).length === 0, JSON.stringify(k.versheid(basis)));
  check('правила оновились (→ 9.0.0) → REGELS_VEROUDERD', vc({ ...basis, regelsVersie: '9.0.0' }).includes('REGELS_VEROUDERD'));
  check('база не предок HEAD → BASIS_NIET_IN_HEAD', vc({ ...basis, headIsAfstammeling: false }).includes('BASIS_NIET_IN_HEAD'));
  const voor = [{ sha: 'x', bestanden: ['src/a.ts', 'src/b.ts'] }];
  const o = k.versheid({ ...basis, integratieVoorsprong: voor });
  check('інтеграція пішла вперед і торкнулась тих самих файлів → BASIS_VEROUDERD_OVERLAP (помилка, перелік файлів)', o.some((z: { code: string; ernst: string; overlap?: string[] }) => z.code === 'BASIS_VEROUDERD_OVERLAP' && z.ernst === 'fout' && z.overlap?.join() === 'src/a.ts'));
  const z2 = k.versheid({ ...basis, integratieVoorsprong: voor, eigenBestanden: ['src/c.ts'] });
  check('інтеграція вперед без перетину → лише попередження BASIS_VEROUDERD', z2.length === 1 && z2[0].code === 'BASIS_VEROUDERD' && z2[0].ernst === 'waarschuwing');
  check('незакомічені зміни при передаванні → NIET_GECOMMIT; на старті — ні', vc({ ...basis, schoon: false }).includes('NIET_GECOMMIT') && !vc({ ...basis, schoon: false, fase: 'start' }).includes('NIET_GECOMMIT'));
  check('заморожена задача не передається без відновлення', vc({ ...basis, taak: { ...taak, staat: 'bevroren' } }).includes('TAAK_BEVROREN'));

  // — етап 1: передача, канали, черга, статуси (чисті функції) —
  const od = { taakId: 'ABC-001', agent: 'grok', basisCommit: 'a'.repeat(40), regelsVersie: '1.1.0', regelsHash: 'b'.repeat(64), samenvatting: { uk: 'Достатньо довгий підсумок змін для тесту', nl: 'x' } };
  const oc = (o: unknown) => k.valideerOverdracht(o, beleid).map((z: { code: string }) => z.code);
  check('ORCH-OVERDRACHT повний → валідний', oc(od).length === 0, JSON.stringify(oc(od)));
  check('ORCH-OVERDRACHT без regelsHash/agent → OVERDRACHT_VELD з назвою поля', (() => { const z = k.valideerOverdracht({ ...od, regelsHash: undefined, agent: '' }, beleid); return z.filter((x: { code: string }) => x.code === 'OVERDRACHT_VELD').map((x: { veld: string }) => x.veld).sort().join() === 'agent,regelsHash'; })());
  check('ORCH-OVERDRACHT: короткий підсумок, невідомий канал, zonderGit без причини', ['SAMENVATTING_TE_KORT', 'KANAAL_ONBEKEND', 'ZONDER_GIT_REDEN'].every((c) => oc({ ...od, samenvatting: { uk: 'мало' }, kanaal: 'fax', zonderGit: 'x' }).includes(c)));
  check('herkenKanaal: zip/tar.gz/patch/тека/гілка/PR-URL; явний mcp переважає', k.herkenKanaal('a.zip', false) === 'zip' && k.herkenKanaal('a.tar.gz', false) === 'tar_gz' && k.herkenKanaal('0001-x.patch', false) === 'git_patch' && k.herkenKanaal('map', true) === 'lokaal_bestand' && k.herkenKanaal('feature/x-001-20261031-120000', false) === 'github_pr' && k.herkenKanaal('https://github.com/Tarasevych/hub/pull/11', false) === 'github_pr' && k.herkenKanaal('a.zip', false, 'mcp') === 'mcp' && k.herkenKanaal('a.zip', false, 'fax') === null && k.herkenKanaal('iets', false) === null);
  check('vergelijkBestanden: збіг → нічого; розбіжність → попередження з обома списками', k.vergelijkBestanden({ gewijzigd: ['a'], toegevoegd: ['b'] }, ['a', 'b']).length === 0 && (() => { const z = k.vergelijkBestanden({ gewijzigd: ['a', 'c'] }, ['a', 'd'])[0]; return z.code === 'BESTANDEN_AFWIJKEND' && z.ernst === 'waarschuwing' && z.nietOpgegeven.join() === 'd' && z.nietGewijzigd.join() === 'c'; })());
  check('padVeilig: відкидає .git, node_modules, .., абсолютні, службові файли пакета', !k.padVeilig('.git/config') && !k.padVeilig('node_modules/x') && !k.padVeilig('../a') && !k.padVeilig('/etc/passwd') && !k.padVeilig('ORCH-OVERDRACHT.json') && !k.padVeilig('UITROL-VERSIE') && k.padVeilig('src/a.ts') && k.padVeilig('deploy/x.sh'));
  let w0: any = { schema: 1, integratieTak: 'integratie', integratieHoofd: null, bezig: null, wachtrij: [] };
  const item = (id: string) => ({ taakId: id, agent: 'a', tak: `feature/${id.toLowerCase()}-20261031-120000`, basisCommit: 'a'.repeat(40), ingediend: 'now', kanaal: 'zip' });
  w0 = k.wachtrijVoegToe(w0, item('AAA-001')).w; w0 = k.wachtrijVoegToe(w0, item('BBB-001')).w;
  check('черга: дубль → WACHTRIJ_DUBBEL', k.wachtrijVoegToe(w0, item('AAA-001')).fout?.code === 'WACHTRIJ_DUBBEL');
  const v1 = k.wachtrijVolgende(w0, 't1'); check('черга: volgende → перша задача bezig', v1.item.taakId === 'AAA-001' && v1.w.bezig === 'AAA-001');
  check('черга: друге volgende під час bezig → WACHTRIJ_BEZIG', k.wachtrijVolgende(v1.w).fout?.code === 'WACHTRIJ_BEZIG');
  check('черга: klaar не для bezig → WACHTRIJ_NIET_BEZIG; integrated без hoofd → WACHTRIJ_HOOFD', k.wachtrijKlaar(v1.w, 'BBB-001', 'integrated', 'c'.repeat(40)).fout?.code === 'WACHTRIJ_NIET_BEZIG' && k.wachtrijKlaar(v1.w, 'AAA-001', 'integrated', '').fout?.code === 'WACHTRIJ_HOOFD');
  const k1 = k.wachtrijKlaar(v1.w, 'AAA-001', 'integrated', 'c'.repeat(40), 't2');
  check('черга: klaar integrated → знято з черги, bezig порожній, integratieHoofd оновлено, історія', k1.w.bezig === null && k1.w.integratieHoofd === 'c'.repeat(40) && k1.w.wachtrij.length === 1 && k1.w.geschiedenis[0].staat === 'integrated' && k1.w.geschiedenis[0].afgerond === 't2');
  const t1 = k.wachtrijTerugtrekken(k1.w, 'BBB-001', 'агент ще працює');
  check('черга: terugtrekken → порожня черга, причина в історії; невідома → WACHTRIJ_ONBEKEND', t1.w.wachtrij.length === 0 && t1.w.geschiedenis[1].reden === 'агент ще працює' && k.wachtrijTerugtrekken(t1.w, 'ZZZ-001', '').fout?.code === 'WACHTRIJ_ONBEKEND');
  const isV = (a: string, b: string) => a === 'i'.repeat(40) && b === 'g'.repeat(40);
  check('statusAfleiden: in_progress → integrated (факт злиття) → released (пакет) → installed (факт установки)', k.statusAfleiden({ staat: 'ter_integratie' }, null, isV).status === 'in_progress' && k.statusAfleiden({ staat: 'integrated', integratieCommit: 'i'.repeat(40) }, null, isV).status === 'integrated' && k.statusAfleiden({ staat: 'integrated', integratieCommit: 'i'.repeat(40), releaseVersie: '20261101-000000' }, null, isV).status === 'released' && k.statusAfleiden({ staat: 'integrated', integratieCommit: 'i'.repeat(40), releaseVersie: '20261101-000000' }, { versie: 'v', bronCommit: 'g'.repeat(40) }, isV).status === 'installed');
  check('statusAfleiden: installed лише якщо integratieCommit справді встановлений (не предок → released)', k.statusAfleiden({ staat: 'integrated', integratieCommit: 'x'.repeat(40), releaseVersie: 'v' }, { bronCommit: 'g'.repeat(40) }, isV).status === 'released' && k.statusAfleiden({ staat: 'bevroren' }, null, isV).status === 'bevroren');

  // — етап 3: підтвердження passkey (сайт → root), різниця текстів, оцінка пропозиції правил (чисті функції) —
  const lockP: any = { schema: 1, regelsVersie: '1.2.0', hash: 'a'.repeat(64), kritiekHash: 'b'.repeat(64), bestanden: {}, eigenaar: null };
  const bP = { regelsVersie: '1.2.0', hash: 'a'.repeat(64), kritiekHash: 'b'.repeat(64), voorstel: 'c'.repeat(24), passkey: '0123abcd', besluit: '11111111-2222-4333-8444-555555555555', op: '2026-10-31T15:00:00Z' };
  const bev = k.bevestigMetPasskey(lockP, bP);
  check('bevestigMetPasskey: збіг версії/hash/kritiekHash → lock з eigenaar.soort=passkey (voorstel, besluit, passkey, op), статус власника ok', bev.lock?.eigenaar?.soort === 'passkey' && bev.lock.eigenaar.besluit === bP.besluit && bev.lock.eigenaar.voorstel === bP.voorstel && bev.lock.eigenaar.passkey === '0123abcd' && bev.lock.eigenaar.kritiekHash === lockP.kritiekHash && bev.lock.eigenaar.hash === lockP.hash && bev.lock.eigenaar.op === bP.op && k.eigenaarStatus(bev.lock, null) === null, JSON.stringify(bev));
  check('bevestigMetPasskey: інші правила → BESLUIT_PAST_NIET; неповне підтвердження → BEVESTIGING_ONGELDIG; без lock → GEEN_LOCK', k.bevestigMetPasskey(lockP, { ...bP, hash: 'f'.repeat(64) }).fout?.code === 'BESLUIT_PAST_NIET' && k.bevestigMetPasskey(lockP, { ...bP, regelsVersie: '1.3.0' }).fout?.code === 'BESLUIT_PAST_NIET' && k.bevestigMetPasskey(lockP, { ...bP, passkey: 'zz' }).fout?.code === 'BEVESTIGING_ONGELDIG' && k.bevestigMetPasskey(lockP, { ...bP, besluit: 'geen-uuid' }).fout?.code === 'BEVESTIGING_ONGELDIG' && k.bevestigMetPasskey(lockP, { ...bP, voorstel: 'xyz' }).fout?.code === 'BEVESTIGING_ONGELDIG' && k.bevestigMetPasskey(null, bP).fout?.code === 'GEEN_LOCK');
  check('eigenaarStatus: passkey-запис без відбитка/id рішення → BEVESTIGING_ONGELDIG; змінений kritiekHash → KRITIEK_GEWIJZIGD; без eigenaar → KRITIEK_NIET_BEVESTIGD', k.eigenaarStatus({ ...bev.lock, eigenaar: { ...bev.lock.eigenaar, passkey: '' } }, null)?.code === 'BEVESTIGING_ONGELDIG' && k.eigenaarStatus({ ...bev.lock, kritiekHash: 'd'.repeat(64) }, null)?.code === 'KRITIEK_GEWIJZIGD' && k.eigenaarStatus(lockP, null)?.code === 'KRITIEK_NIET_BEVESTIGD');
  check('vergrendel зберігає passkey-підтвердження, поки kritiekHash той самий (некритична зміна правил)', (() => { const b2 = { ...beleid, regelsVersie: '9.9.9' }; const r1 = k.vergrendel(b2, { ...bestanden, 'AGENTS.md': `${bestanden['AGENTS.md']}\n<!-- x -->\n` }, { ...k.vergrendel(beleid, bestanden, null).lock, eigenaar: { soort: 'passkey', kritiekHash: k.vergrendel(beleid, bestanden, null).lock.kritiekHash, regelsVersie: beleid.regelsVersie, hash: 'a'.repeat(64), voorstel: 'c'.repeat(24), besluit: bP.besluit, passkey: '0123abcd', op: bP.op } }); return r1.lock?.eigenaar?.soort === 'passkey'; })());
  check('regelVerschil: додані/видалені рядки й ознака зміни; однакові (навіть з CRLF/BOM) → без змін', JSON.stringify(k.regelVerschil('a\nb\n', 'a\nc\nd\n')) === JSON.stringify({ toegevoegd: 2, verwijderd: 1, gewijzigd: true }) && k.regelVerschil('a\nb\n', '﻿a\r\nb\r\n').gewijzigd === false && k.regelVerschil(undefined, 'x').toegevoegd === 1);
  const huidig = { beleid, bestanden, lock: k.vergrendel(beleid, bestanden, null).lock };
  const bo = (nieuw: Record<string, string>) => k.beoordeelVoorstel(huidig, { bestanden: nieuw });
  const zc = (r: any) => r.zaken.map((z: { code: string }) => z.code);
  const volgende = beleid.regelsVersie.replace(/(\d+)$/, (m: string) => String(Number(m) + 1));
  const beleidMet = (f: (b: any) => void = () => undefined) => { const b = JSON.parse(bestanden['orchestratie/beleid.json']); b.regelsVersie = volgende; f(b); return JSON.stringify(b, null, 2); };
  const besluitMet = `${bestanden['orchestratie/BESLUITEN.md']}\n## B-099 · 2026-10-31 · ${volgende} · voorstel\n\nТест.\n`;
  check('beoordeelVoorstel: порожня → VOORSTEL_LEEG; не файл правил → VOORSTEL_PAD; без змін → GEEN_WIJZIGING', zc(bo({})).includes('VOORSTEL_LEEG') && zc(bo({ 'src/x.ts': 'x' })).includes('VOORSTEL_PAD') && zc(bo({ 'AGENTS.md': bestanden['AGENTS.md'] })).includes('GEEN_WIJZIGING'));
  check('beoordeelVoorstel: зміна без підвищення версії → VERSIE_NIET_VERHOOGD; версія без запису в BESLUITEN.md → BESLUIT_ONTBREEKT', zc(bo({ 'AGENTS.md': `${bestanden['AGENTS.md']}\n<!-- x -->\n` })).includes('VERSIE_NIET_VERHOOGD') && zc(bo({ 'orchestratie/beleid.json': beleidMet() })).includes('BESLUIT_ONTBREEKT'));
  check('beoordeelVoorstel: зіпсований JSON → BELEID_JSON; зміна regelBestanden → REGELBESTANDEN_GEWIJZIGD; невалідна політика → коди valideerBeleid', zc(bo({ 'orchestratie/beleid.json': '{' })).includes('BELEID_JSON') && zc(bo({ 'orchestratie/beleid.json': beleidMet((b) => b.regelBestanden.push('X.md')), 'orchestratie/BESLUITEN.md': besluitMet })).includes('REGELBESTANDEN_GEWIJZIGD') && zc(bo({ 'orchestratie/beleid.json': beleidMet((b) => { b.kritiek.privesleutelsNaarAgenten = true; }), 'orchestratie/BESLUITEN.md': besluitMet })).includes('SLEUTELS'));
  const goedV = bo({ 'orchestratie/beleid.json': beleidMet(), 'orchestratie/BESLUITEN.md': besluitMet });
  check('beoordeelVoorstel: коректна пропозиція → versie, hash (64 hex, інший), kritiekGewijzigd=false, verschil по файлах, lock без eigenaar', goedV.zaken.length === 0 && goedV.regelsVersie === volgende && /^[0-9a-f]{64}$/.test(goedV.hash) && goedV.hash !== huidig.lock.hash && goedV.kritiekHash === huidig.lock.kritiekHash && goedV.kritiekGewijzigd === false && goedV.verschil['orchestratie/BESLUITEN.md'].toegevoegd >= 3 && goedV.verschil['AGENTS.md'].gewijzigd === false && goedV.lock.eigenaar === null && goedV.lock.regelsVersie === volgende, JSON.stringify(goedV.zaken));
  const kritV = bo({ 'orchestratie/beleid.json': beleidMet((b) => { b.kritiek.installatieModi.toegestaan.push('automatisch_beperkt'); }), 'orchestratie/BESLUITEN.md': besluitMet });
  check('beoordeelVoorstel: критична зміна → kritiekGewijzigd=true, інший kritiekHash; попереднє підтвердження не переноситься', kritV.kritiekGewijzigd === true && kritV.kritiekHash !== huidig.lock.kritiekHash && k.beoordeelVoorstel({ ...huidig, lock: { ...huidig.lock, eigenaar: bev.lock.eigenaar } }, { bestanden: { 'orchestratie/beleid.json': beleidMet((b) => { b.kritiek.installatieModi.toegestaan.push('automatisch_beperkt'); }), 'orchestratie/BESLUITEN.md': besluitMet } }).lock.eigenaar === null);
  check('compacteContext: позначає спосіб підтвердження (passkey / SSH / не підтверджено)', /bevestigd \(passkey\)/.test(k.compacteContext(bestanden['AGENTS.md'], beleid, bev.lock)) && /NIET bevestigd/.test(k.compacteContext(bestanden['AGENTS.md'], beleid, lockP)));

  // — черга (закомічений файл) —
  const w = JSON.parse(lees('orchestratie/wachtrij.json'));
  check('черга послідовна: один запис «bezig» або жоден, ORCH-001 у черзі', w.bezig === null && w.wachtrij.some((r: { taakId: string }) => r.taakId === 'ORCH-001'));
  // — реєстр рішень —
  const besl = lees('orchestratie/BESLUITEN.md');
  check('BESLUITEN.md: B-001…B-003 (1.0.0) і B-004 (1.1.0) зі статусом', ['B-001', 'B-002', 'B-003'].every((b) => new RegExp(`## ${b} · \\d{4}-\\d{2}-\\d{2} · 1\\.0\\.0 · (voorstel|bevestigd)`).test(besl)) && /## B-004 · \d{4}-\d{2}-\d{2} · 1\.1\.0 · (voorstel|bevestigd)/.test(besl));
  check('BESLUITEN.md фіксує, що базу ще не звірено з production (чесність)', /не виконано|niet uitgevoerd/.test(besl) && beleid.basis.verificatie === 'opgave_eigenaar');
  return einde();
}
