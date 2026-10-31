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
  check('зміна правил з вищою версією → новий lock', !!k.vergrendel({ ...beleid, regelsVersie: '1.0.1' }, gewijzigd, lock).lock);
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
  check('правила оновились (1.0.0 → 1.1.0) → REGELS_VEROUDERD', vc({ ...basis, regelsVersie: '1.1.0' }).includes('REGELS_VEROUDERD'));
  check('база не предок HEAD → BASIS_NIET_IN_HEAD', vc({ ...basis, headIsAfstammeling: false }).includes('BASIS_NIET_IN_HEAD'));
  const voor = [{ sha: 'x', bestanden: ['src/a.ts', 'src/b.ts'] }];
  const o = k.versheid({ ...basis, integratieVoorsprong: voor });
  check('інтеграція пішла вперед і торкнулась тих самих файлів → BASIS_VEROUDERD_OVERLAP (помилка, перелік файлів)', o.some((z: { code: string; ernst: string; overlap?: string[] }) => z.code === 'BASIS_VEROUDERD_OVERLAP' && z.ernst === 'fout' && z.overlap?.join() === 'src/a.ts'));
  const z2 = k.versheid({ ...basis, integratieVoorsprong: voor, eigenBestanden: ['src/c.ts'] });
  check('інтеграція вперед без перетину → лише попередження BASIS_VEROUDERD', z2.length === 1 && z2[0].code === 'BASIS_VEROUDERD' && z2[0].ernst === 'waarschuwing');
  check('незакомічені зміни при передаванні → NIET_GECOMMIT; на старті — ні', vc({ ...basis, schoon: false }).includes('NIET_GECOMMIT') && !vc({ ...basis, schoon: false, fase: 'start' }).includes('NIET_GECOMMIT'));
  check('заморожена задача не передається без відновлення', vc({ ...basis, taak: { ...taak, staat: 'bevroren' } }).includes('TAAK_BEVROREN'));

  // — черга —
  const w = JSON.parse(lees('orchestratie/wachtrij.json'));
  check('черга послідовна: один запис «bezig» або жоден, ORCH-001 у черзі', w.bezig === null && w.wachtrij.some((r: { taakId: string }) => r.taakId === 'ORCH-001'));
  // — реєстр рішень —
  const besl = lees('orchestratie/BESLUITEN.md');
  check('BESLUITEN.md: B-001…B-003 зі статусом і версією 1.0.0', ['B-001', 'B-002', 'B-003'].every((b) => new RegExp(`## ${b} · \\d{4}-\\d{2}-\\d{2} · 1\\.0\\.0 · (voorstel|bevestigd)`).test(besl)));
  check('BESLUITEN.md фіксує, що базу ще не звірено з production (чесність)', /не виконано|niet uitgevoerd/.test(besl) && beleid.basis.verificatie === 'opgave_eigenaar');
  return einde();
}
