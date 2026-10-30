// АТАКУЮЧІ ТЕСТИ ІЗОЛЯЦІЇ ПОШУКУ /zoek (зона Z5, 22.10.2026; специфікація §9 «ізоляція й безпека», §14 «безпека»).
//
// Усе через СПРАВЖНІЙ роутер (backend/index.ts → handler) і справжні сесії двох людей у двох браузерах (hulp/nep-google),
// на живій PostgreSQL. Кожна перевірка — це атака, яка МАЄ бути відбита; якщо Z1–Z4 чогось не зробили, перевірка падає.
//   1. два користувачі з ОДНАКОВИМИ назвами документів і запитами → жодного перетину: результати, facets, totaal,
//      автодоповнення, виправлення («можливо, ви мали на увазі»), історія;
//   2. userId/ownerUserId/lade у тілі запиту ігноруються — лада лише із сесії;
//   3. технічний простір не бачить особисте, особистий — технічне; закрита служба → джерело не шукається і названо в gesloten;
//   4. чужий id у відкритті історії → нічого (ані назви, ані тексту); чужий id у знімку історії → «weg», не «нове»;
//   5. після видалення документа / відключення служби результат зникає (індекс, підказки, історія-знімок);
//   6. обхід фільтрації: bronnen:['*'], SQL-ін'єкції у q/фільтрах/сортуванні/пагінації, довгі рядки, юнікод-керуючі → без 500,
//      без чужих рядків, таблиця ціла;
//   7. секрети (PRIVATE KEY, ghp_, sk_live_, password=, JWT) не потрапляють в індекс, фрагменти, підказки;
//   8. журнал сервера не містить текстів документів (console.* під час індексації й пошуку);
//   9. RLS: прямий SELECT від ролі app з app.user_id = B → 0 рядків A (zoek_objecten, zoek_geschiedenis, zoek_ocr_tekst,
//      zoek_wachtrij) — лише коли тест запущено з DATABASE_URL_APP (run-test-rls.sh); інакше чесно «пропущено»;
//  10. OCR-кеш і черга — лише свій простір (user_id + ruimte обов'язкові, RLS);
//  11. закритий ключ людини (sleutelkluis «gesloten») → фонова індексація пошти/Drive нічого не читає й нічого не пише.
import { randomBytes } from 'node:crypto';
import { getPool, appRolActief } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';
import type { Lade } from '../../shared/ruimte-scheiding';
import type { ZoekBron, ZoekObject, ZoekTreffer } from '../../shared/zoek-model';

const HUB = 'hub.tarasevych.com';
type Antw = { status: number; data: Record<string, any>; body: string }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Br = { verzoek: (host: string, pad: string, body?: unknown, extra?: Record<string, unknown>) => Promise<Antw>; aanmelden: (sub: string, email: string, o?: Record<string, unknown>) => Promise<unknown>; tab: string; ctxBody: (s?: string, e?: Record<string, unknown>) => Record<string, unknown> };

const ids = (a: Antw): string[] => (Array.isArray(a.data?.items) ? a.data.items : []).map((t: ZoekTreffer) => `${t.bron}:${t.id}`);
const alleTekst = (a: Antw) => a.body;
const SECRET = {
  // De pem- en ghp-fixtures zijn opgeknipt zodat de geheimenscan van de uitrol-voorcontrole dit TESTBESTAND niet als
  // geheim meldt; tijdens de test zijn het dezelfde aaneengesloten strings als voorheen.
  pem: '-----BEGIN PRIVATE' + ' KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7ZZZZQQQQ\n-----END PRIVATE' + ' KEY-----',
  ghp: 'ghp_' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab', stripe: 'sk_live_51HxQQQQabcdefghijklmnop', pw: 'password=hunter2geheim99',
  jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
};
const SECRET_MARKERS = ['MIIEvQIBADANBg', 'ghp_ABCDEFGHIJ', 'sk_live_51HxQQQQ', 'hunter2geheim99', 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'];

export async function main(): Promise<number> {
  const { check, einde } = checker('zoek-isolatie');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const pool = getPool('systeem');
  const kern = await import('../../backend/zoek-index');
  const { indexeer, verwijder } = kern as unknown as { indexeer: (lade: Lade, o: ZoekObject[]) => Promise<unknown>; verwijder: (lade: Lade, bron: ZoekBron, ids: string[]) => Promise<number> };
  check('ядро Z1: indexeer/verwijder присутні', typeof indexeer === 'function' && typeof verwijder === 'function');
  if (typeof indexeer !== 'function') return einde();

  const eigenaar = `zi-a-${T}@example.test`, subA = `sub-zi-a-${T}`, emailB = `zi-b-${T}@example.test`, subB = `sub-zi-b-${T}`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const opruim: string[] = [];
  let A = '', B = '';
  const nu = Date.now();
  const UNIEK_A = `Zzyqualpha${T.slice(-4)}`, UNIEK_B = `Zzyqubravo${T.slice(-4)}`, MARKER_A = `markertekstA${T.slice(-6)}`, MARKER_B = `markertekstB${T.slice(-6)}`;
  const docs = (u: string, ruimte: 'prive' | 'technisch', sfx: string, uniek: string, marker: string): ZoekObject[] => [
    { id: `zi-mail-huur${sfx}`, bron: 'mail', soort: 'bericht', titel: 'Factuur huur oktober', omschrijving: 'verhuurder@voorbeeld.test', tekst: `Beste, hierbij de factuur voor de huur van oktober. ${marker}`, bijgewerktOp: nu, rechten: { userId: u, ruimte } },
    { id: `zi-cloud-garantie${sfx}`, bron: 'cloud', soort: 'bestand', titel: 'Гарантійний талон', tekst: `Гарантійний талон на пральну машину. ${marker}`, bijgewerktOp: nu, rechten: { userId: u, ruimte } },
    { id: `zi-bijlage-akte${sfx}`, bron: 'bijlage', soort: 'bijlage', titel: 'koopakte.pdf', tekst: `Notariële akte, Kortrijksesteenweg 12. ${marker}`, bijgewerktOp: nu, rechten: { userId: u, ruimte } },
    { id: `zi-agenda-notaris${sfx}`, bron: 'agenda', soort: 'afspraak', titel: 'Зустріч із нотаріусом', tekst: 'Підписання купчої', bijgewerktOp: nu, rechten: { userId: u, ruimte } },
    { id: `zi-bord-melk${sfx}`, bron: 'bord', soort: 'taak', titel: 'Купити молоко', bijgewerktOp: nu, rechten: { userId: u, ruimte } },
    { id: `zi-github-repo${sfx}`, bron: 'github', soort: 'repo', titel: 'pavlo/mijn-ruimte', tekst: 'README', bijgewerktOp: nu, rechten: { userId: u, ruimte } },
    { id: `zi-uniek${sfx}`, bron: 'cloud', soort: 'bestand', titel: `${uniek} document`, tekst: `${uniek} tekst ${marker}`, bijgewerktOp: nu, rechten: { userId: u, ruimte } },
  ];
  const logboek: string[] = [];
  const consoleVoor = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
  const vang = () => { for (const k of Object.keys(consoleVoor) as Array<keyof typeof consoleVoor>) console[k] = (...a: unknown[]) => { logboek.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); }; };
  const laat = () => { Object.assign(console, consoleVoor); };
  const zoekVia = (b: Br, body: Record<string, unknown>, service = 'hub') => b.verzoek(HUB, '/api/owner/zoek', b.ctxBody(service, body));
  const sug = (b: Br, prefix: string, extra: Record<string, unknown> = {}) => b.verzoek(HUB, '/api/owner/zoek/suggesties', b.ctxBody('hub', { prefix, ...extra }));

  try {
    // ------------------------------------------------------------------ 0. два користувачі, три лади
    const P = G.browser() as unknown as Br; await P.aanmelden(subA, eigenaar, { service: 'hub', authTime: Math.floor(Date.now() / 1000) - 3600 });
    A = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id || '');
    const Bb = G.browser() as unknown as Br; await Bb.aanmelden(subB, emailB, { service: 'hub' });
    B = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [emailB])).rows[0]?.id || '');
    opruim.push(A, B);
    await pool.query(`update app.records set data = data || '{"status":"approved"}'::jsonb where tbl='users' and id = ANY($1)`, [[A, B]]);
    check('підготовка: два акаунти з сесіями (A — власник, B — звичайний, обидва approved)', !!A && !!B && A !== B, `${A} ${B}`);
    const lA: Lade = { userId: A, ruimte: 'prive' }, lB: Lade = { userId: B, ruimte: 'prive' }, lAt: Lade = { userId: A, ruimte: 'technisch' };
    // технічна вкладка A: cloud → «власні дані» (technisch), mail лишається «uit» (закрита служба)
    const Tb = G.browser() as unknown as Br; await Tb.aanmelden(subA, eigenaar, { service: 'hub', authTime: Math.floor(Date.now() / 1000) - 3600 });
    const { tabHash } = await import('../../backend/tech-profiel');
    const rs = await import('../../backend/ruimte-scheiding');
    await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1,$2,ARRAY['eigenaar'],240,'test') ON CONFLICT (user_id) DO UPDATE SET rollen = EXCLUDED.rollen, ingetrokken_op = NULL`, [A, `tech-${randomBytes(6).toString('hex')}`]);
    const pid = String((await pool.query('SELECT profiel_id FROM app.tech_profielen WHERE user_id=$1', [A])).rows[0].profiel_id);
    await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op) VALUES ($1,$2,$3,ARRAY['eigenaar'],'zoek-isolatie', now() + interval '60 minutes')`, [A, pid, tabHash(Tb.tab)]);
    await pool.query('DELETE FROM app.ruimte_dienst_stand WHERE user_id = $1', [A]); await pool.query('DELETE FROM app.ruimte_keuze WHERE user_id = $1', [A]);
    await rs.keuzeZetten(A, 'per_dienst', A);
    await rs.dienstZetten(A, 'cloud', 'verbind-eigen', { stapOpGedaan: true });
    await rs.dienstZetten(A, 'bord', 'verbind-eigen', { stapOpGedaan: true });
    const ladeT = await rs.gegevensLade({ userId: A, tabContext: Tb.tab, dienst: 'cloud' });
    check('підготовка: технічна вкладка A → cloud у ТЕХНІЧНІЙ ладі; mail у технічному просторі закрита («uit»)', ladeT.ok === true && (ladeT as { lade: Lade }).lade.ruimte === 'technisch' && !(await rs.gegevensLade({ userId: A, tabContext: Tb.tab, dienst: 'mail' })).ok, JSON.stringify(ladeT).slice(0, 120));

    // засіяти: однакові назви в A і B; окрім того — технічний документ A і лист із секретами в A
    vang();
    try {
      await indexeer(lA, [...docs(A, 'prive', '', UNIEK_A, MARKER_A),
        { id: 'zi-mail-geheim', bron: 'mail', soort: 'bericht', titel: 'Toegang tot de server', tekst: `Sleutels: ${SECRET.stripe} en ${SECRET.ghp} en ${SECRET.pw}. Token: ${SECRET.jwt}\n${SECRET.pem}`, bijgewerktOp: nu, rechten: lA }]);
      await indexeer(lB, docs(B, 'prive', '-B', UNIEK_B, MARKER_B));
      await indexeer(lAt, [{ id: 'zi-cloud-tech', bron: 'cloud', soort: 'bestand', titel: 'Технічний документ сервера', tekst: `nginx systemd ${MARKER_A}tech`, bijgewerktOp: nu, rechten: lAt },
        { id: 'zi-bord-tech', bron: 'bord', soort: 'taak', titel: 'Купити молоко', tekst: 'технічна дошка', bijgewerktOp: nu, rechten: lAt }]);
    } finally { laat(); }
    const nA = (await pool.query('SELECT count(*)::int AS n FROM app.zoek_objecten WHERE user_id=$1', [A])).rows[0].n;
    check('підготовка: індекс засіяно (A prive 8, A technisch 2, B prive 7)', nA === 10 && (await pool.query('SELECT count(*)::int AS n FROM app.zoek_objecten WHERE user_id=$1', [B])).rows[0].n === 7, String(nA));

    // ------------------------------------------------------------------ 1. однакові назви, однакові запити → нуль перетину
    const { zoekNorm } = await import('../../shared/zoek-normalisatie');
    const bevatWoord = (body: string, w: string) => body.toLowerCase().includes(w.toLowerCase()) || body.includes(zoekNorm(w));
    const qa = await zoekVia(P, { q: 'Factuur huur', facets: true }), qb = await zoekVia(Bb, { q: 'Factuur huur', facets: true });
    check('маршрут POST /api/owner/zoek існує і відповідає 200 з items/totaal/facets', qa.status === 200 && Array.isArray(qa.data.items) && typeof qa.data.totaal === 'number' && !!qa.data.facets, `${qa.status} ${qa.body.slice(0, 160)}`);
    check('A бачить лише свій лист; B — лише свій (однакова тема «Factuur huur oktober»)',
      ids(qa).includes('mail:zi-mail-huur') && !ids(qa).some((i) => i.endsWith('-B')) && ids(qb).includes('mail:zi-mail-huur-B') && !ids(qb).includes('mail:zi-mail-huur'), `A=${ids(qa)} B=${ids(qb)}`);
    check('тіло відповіді A не містить жодного рядка B (ані id, ані маркера тексту), і навпаки', !alleTekst(qa).includes(MARKER_B) && !alleTekst(qa).includes('-B"') && !alleTekst(qb).includes(MARKER_A));
    check('facets/totaal рахують лише власні рядки (A: 1 лист; B: 1 лист)', qa.data.totaal === 1 && qb.data.totaal === 1 && Number(qa.data.facets?.bron?.mail || 0) === 1 && Number(qb.data.facets?.bron?.mail || 0) === 1, `${qa.data.totaal}/${JSON.stringify(qa.data.facets?.bron)} ${qb.data.totaal}`);
    const breed = await Promise.all(['Factuur', 'Гарантійний талон', 'koopakte', 'нотаріусом', 'молоко', 'mijn-ruimte', MARKER_B, UNIEK_B, 'markertekst'].map((q) => zoekVia(P, { q, facets: true, perPagina: 50 })));
    const breedIds = breed.flatMap(ids);
    check('9 запитів A по всіх джерелах (зокрема маркер і унікальне слово B): жодного рядка B, маркера B немає в жодній відповіді; власні документи знайдено',
      breed.every((r) => r.status === 200) && breedIds.length >= 5 && !breedIds.some((i) => i.endsWith('-B')) && !breed.some((r) => JSON.stringify(r.data.items || []).includes(MARKER_B) || JSON.stringify(r.data.suggesties || []).includes(MARKER_B)), breedIds.join(','));
    // автодоповнення
    const sA = await sug(P, UNIEK_B.slice(0, 6)), sB = await sug(Bb, UNIEK_B.slice(0, 6)), sAe = await sug(P, UNIEK_A.slice(0, 6));
    check('маршрут /api/owner/zoek/suggesties існує', sA.status === 200 && Array.isArray(sA.data.suggesties), `${sA.status} ${sA.body.slice(0, 120)}`);
    check('автодоповнення: A за префіксом унікального слова B не отримує нічого з B; B отримує; A отримує власне слово',
      !bevatWoord(sA.body, UNIEK_B) && bevatWoord(sB.body, UNIEK_B) && bevatWoord(sAe.body, UNIEK_A), `A:${sA.body.slice(0, 100)} B:${sB.body.slice(0, 100)} Ae:${sAe.body.slice(0, 100)}`);
    // виправлення («можливо, ви мали на увазі»): помилка в унікальному слові B
    const corrA = await zoekVia(P, { q: UNIEK_B.slice(0, -1) + 'x' }), corrB = await zoekVia(Bb, { q: UNIEK_B.slice(0, -1) + 'x' });
    check('виправлення: A з помилкою в слові B не отримує підказку з лексикону B (B — отримує або знаходить)',
      !bevatWoord(corrA.body, UNIEK_B) && bevatWoord(corrB.body, UNIEK_B), `A:${corrA.body.slice(0, 160)}`);
    // історія
    const bew = await P.verzoek(HUB, '/api/owner/zoek/geschiedenis/bewaren', P.ctxBody('hub', { vraag: `Factuur huur ${T}`, treffers: [{ bron: 'mail', id: 'zi-mail-huur' }], totaal: 1 }));
    const lijstB = await Bb.verzoek(HUB, '/api/owner/zoek/geschiedenis/lijst', Bb.ctxBody('hub', {}));
    const lijstA = await P.verzoek(HUB, '/api/owner/zoek/geschiedenis/lijst', P.ctxBody('hub', {}));
    check('історія: запит A збережено; список B його не містить; список A — містить', bew.status === 200 && lijstB.status === 200 && !lijstB.body.includes(`Factuur huur ${T}`) && lijstA.body.includes(`Factuur huur ${T}`), `${bew.status} ${lijstA.body.slice(0, 100)}`);
    const hid = String(bew.data?.item?.id || '');
    const openB = await Bb.verzoek(HUB, '/api/owner/zoek/geschiedenis/open', Bb.ctxBody('hub', { id: hid }));
    check('чужий id запису історії → нічого (item null), без назв і тексту', openB.status === 200 && openB.data.item === null && !openB.body.includes('zi-mail-huur'), openB.body.slice(0, 120));
    const wisB = await Bb.verzoek(HUB, '/api/owner/zoek/geschiedenis/wis', Bb.ctxBody('hub', { id: hid }));
    check('чужий id у видаленні історії → нічого не видалено (запис A лишається)', wisB.data.ok !== true && (await pool.query('SELECT 1 FROM app.zoek_geschiedenis WHERE id = $1 AND user_id = $2', [hid, A])).rows.length === 1, wisB.body.slice(0, 80));
    // знімок історії з чужими id → «weg», не «нове», і без назв
    const snap = await Bb.verzoek(HUB, '/api/owner/zoek/geschiedenis/bewaren', Bb.ctxBody('hub', { vraag: `snap ${T}`, treffers: [{ bron: 'mail', id: 'zi-mail-huur' }, { bron: 'cloud', id: 'zi-uniek' }], totaal: 2 }));
    check('знімок історії B з id документів A: сервер зберігає лише (bron,id) — жодної назви/тексту A у відповіді', snap.status === 200 && !snap.body.includes(MARKER_A) && !snap.body.includes('Factuur'), snap.body.slice(0, 160));

    // ------------------------------------------------------------------ 2. userId у тілі ігнорується
    const vals = await zoekVia(P, { q: 'Factuur huur', userId: B, ownerUserId: B, user_id: B, lade: { userId: B, ruimte: 'prive' }, rechten: { userId: B }, ruimte: 'prive' });
    check('userId/ownerUserId/lade/rechten у тілі → ігноровано: результати лишаються A', vals.status === 200 && ids(vals).includes('mail:zi-mail-huur') && !ids(vals).some((i) => i.endsWith('-B')), ids(vals).join(','));
    const valsT = await zoekVia(P, { q: 'Технічний документ', ruimte: 'technisch', lade: { userId: A, ruimte: 'technisch' } });
    check('ruimte:"technisch" у тілі з особистої вкладки → ігноровано: технічний документ НЕ видно', valsT.status === 200 && !ids(valsT).includes('cloud:zi-cloud-tech'), ids(valsT).join(','));

    // ------------------------------------------------------------------ 3. технічне ↔ особисте, закрита служба
    const techQ = await zoekVia(Tb, { q: 'Технічний документ' }), techMail = await zoekVia(Tb, { q: 'Factuur huur', facets: true }), techMelk = await zoekVia(Tb, { q: 'молоко' });
    check('технічна вкладка: бачить технічний документ cloud', techQ.status === 200 && ids(techQ).includes('cloud:zi-cloud-tech'), `${techQ.status} ${ids(techQ)}`);
    check('технічна вкладка: пошта закрита («uit») → жодного листа, mail названо в gesloten', ids(techMail).length === 0 && Array.isArray(techMail.data.gesloten) && techMail.data.gesloten.some((g: { dienst?: string }) => g.dienst === 'mail'), `${ids(techMail)} gesloten=${JSON.stringify(techMail.data.gesloten).slice(0, 120)}`);
    check('технічна вкладка: «молоко» знаходить ТЕХНІЧНУ дошку, не особисту (однакова назва задачі)', ids(techMelk).includes('bord:zi-bord-tech') && !ids(techMelk).includes('bord:zi-bord-melk'), ids(techMelk).join(','));
    const privTech = await zoekVia(P, { q: 'Технічний документ nginx' });
    check('особиста вкладка: технічний документ невидимий', privTech.status === 200 && !ids(privTech).includes('cloud:zi-cloud-tech') && !privTech.body.includes(`${MARKER_A}tech`), ids(privTech).join(','));
    const techSug = await sug(Tb, 'Factu'), techSugT = await sug(Tb, 'Технічн');
    check('технічна вкладка: підказки не містять тем особистої пошти (ані «factuur» як aanvulling), але містять технічний документ',
      !techSug.data.suggesties?.some((s: { soort: string; tekst: string }) => s.soort === 'aanvulling' && /factuur/i.test(s.tekst)) && bevatWoord(techSugT.body, 'Технічний'), `${techSug.body.slice(0, 120)} | ${techSugT.body.slice(0, 120)}`);
    // відключення служби → джерело зникає з результатів
    await rs.dienstZetten(A, 'cloud', 'ontkoppel');
    const naLos = await zoekVia(Tb, { q: 'Технічний документ', facets: true });
    check('після від\'єднання cloud у технічному просторі: технічний документ зникає з результатів і facets; cloud у gesloten', !ids(naLos).includes('cloud:zi-cloud-tech') && Number(naLos.data.facets?.bron?.cloud || 0) === 0 && (naLos.data.gesloten || []).some((g: { dienst?: string }) => g.dienst === 'cloud'), `${ids(naLos)} ${JSON.stringify(naLos.data.gesloten).slice(0, 100)}`);
    const naLosSug = await sug(Tb, 'Технічн');
    check('після від\'єднання: підказки теж не згадують технічний документ', !naLosSug.data.suggesties?.some((x: { soort: string; tekst: string }) => x.soort === 'aanvulling' && bevatWoord(x.tekst, 'Технічний')), naLosSug.body.slice(0, 100));
    await rs.dienstZetten(A, 'cloud', 'verbind-eigen', { stapOpGedaan: true });

    // ------------------------------------------------------------------ 4. видалення документа → зникає всюди
    const voorWeg = await zoekVia(P, { q: `${UNIEK_A}` });
    await verwijder(lA, 'cloud', ['zi-uniek']);
    const naWeg = await zoekVia(P, { q: `${UNIEK_A}` }), naWegSug = await sug(P, UNIEK_A.slice(0, 6));
    check('видалений документ: був у результатах → зник із результатів і підказок', ids(voorWeg).includes('cloud:zi-uniek') && !ids(naWeg).includes('cloud:zi-uniek') && !bevatWoord(naWegSug.body, UNIEK_A), `${ids(voorWeg)} → ${ids(naWeg)}`);
    const herBew = await P.verzoek(HUB, '/api/owner/zoek/geschiedenis/bewaren', P.ctxBody('hub', { vraag: `Factuur huur ${T}`, treffers: [{ bron: 'mail', id: 'zi-mail-huur' }, { bron: 'cloud', id: 'zi-uniek' }], totaal: 2 }));
    const herBew2 = await P.verzoek(HUB, '/api/owner/zoek/geschiedenis/bewaren', P.ctxBody('hub', { vraag: `Factuur huur ${T}`, treffers: [{ bron: 'mail', id: 'zi-mail-huur' }], totaal: 1 }));
    check('повторне відкриття історії: зниклий документ позначено «weg», не «nieuw»', herBew.status === 200 && Array.isArray(herBew2.data.weg) && herBew2.data.weg.some((t: { id: string }) => t.id === 'zi-uniek') && !(herBew2.data.nieuw || []).some((t: { id: string }) => t.id === 'zi-uniek'), JSON.stringify({ weg: herBew2.data.weg, nieuw: herBew2.data.nieuw }).slice(0, 160));

    // ------------------------------------------------------------------ 5. обхід фільтрації / ін'єкції
    const aanvallen: Array<[string, Record<string, unknown>]> = [
      ['bronnen:["*"]', { q: 'Factuur huur', bronnen: ['*'] }],
      ['bronnen:["mail\' OR 1=1 --"]', { q: 'Factuur huur', bronnen: ["mail' OR 1=1 --"] }],
      ['bronnen як рядок', { q: 'Factuur huur', bronnen: 'mail' }],
      ['bronnen:[null,{},1]', { q: 'Factuur huur', bronnen: [null, {}, 1] }],
      ['sorteer з SQL', { q: 'Factuur huur', sorteer: 'bijgewerkt_op; DROP TABLE app.zoek_objecten; --' }],
      ['sorteer: user_id', { q: 'Factuur huur', sorteer: 'user_id' }],
      ["q: '; DROP TABLE", { q: "'; DROP TABLE app.zoek_objecten; --" }],
      ['q: ) OR 1=1', { q: ') OR 1=1 --' }],
      ['q: \\ (бекслеш)', { q: '\\' }],
      ['q: tsquery-оператори', { q: 'huur:* | factuur & !x <-> y (a)' }],
      ['q: 10 000 знаків', { q: 'a'.repeat(10000) }],
      ['q: NUL + RTL + zero-width', { q: 'Fac\u0000tuur ‮huur​‍﻿' }],
      ['q: лише емодзі/пунктуація', { q: '🙂🙂 !!! ???' }],
      ['pagina:-1, perPagina:1e9', { q: 'Factuur huur', pagina: -1, perPagina: 1e9 }],
      ['pagina:"2;DROP"', { q: 'Factuur huur', pagina: '2;DROP', perPagina: 'x' }],
      ['sinds: рядок/об\'єкт', { q: 'Factuur huur', sinds: 'abc', tot: { $gt: 0 } }],
      ['talen/soorten/formaten сміття', { q: 'Factuur huur', talen: ['xx', "'"], soorten: ['*'], formaten: ["pdf' OR '1'='1"] }],
      ['q: 200 токенів', { q: Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ') }],
    ];
    let aanvalOk = true; const aanvalLog: string[] = [];
    for (const [naam, body] of aanvallen) {
      const r = await zoekVia(P, body);
      const lek = ids(r).some((i) => i.endsWith('-B')) || r.body.includes(MARKER_B);
      const goed = (r.status === 200 || r.status === 400) && !lek;
      if (!goed) aanvalOk = false;
      aanvalLog.push(`${naam}→${r.status}${lek ? ' ВИТІК' : ''}`);
    }
    check('18 спроб обходу/ін\'єкцій: лише 200 або 400, ніколи 500, жодного рядка B', aanvalOk, aanvalLog.join(' | '));
    check('таблиця індексу ціла після атак (рядки A і B на місці)', (await pool.query('SELECT count(*)::int AS n FROM app.zoek_objecten WHERE user_id = ANY($1)', [[A, B]])).rows[0].n === 16);
    const sugAanval = await sug(P, "' OR 1=1 --", { bronnen: ['*'] }), sugLang = await sug(P, 'x'.repeat(5000));
    check('підказки: ін\'єкція/довгий префікс → 200/400, без рядків B', [sugAanval, sugLang].every((r) => (r.status === 200 || r.status === 400) && !r.body.includes(UNIEK_B)), `${sugAanval.status} ${sugLang.status}`);
    const geenService = await P.verzoek(HUB, '/api/owner/zoek', { q: 'Factuur huur', tabContext: P.tab });
    check('без service у тілі → 403 (контекст сесії обов\'язковий), не порожній 200', geenService.status === 403, `${geenService.status} ${geenService.body.slice(0, 80)}`);
    const geenSessie = await (G.browser() as unknown as Br).verzoek(HUB, '/api/owner/zoek', { q: 'Factuur huur', service: 'hub', tabContext: 'x'.repeat(48) });
    check('без сесії → 401/403, без результатів', (geenSessie.status === 401 || geenSessie.status === 403) && !Array.isArray(geenSessie.data.items), String(geenSessie.status));

    // ------------------------------------------------------------------ 6. секрети
    const rij = (await pool.query(`SELECT titel, tekst, tekst_norm, trefwoorden, omschrijving, extra::text AS extra FROM app.zoek_objecten WHERE user_id=$1 AND bron='mail' AND bron_id='zi-mail-geheim'`, [A])).rows[0] || {};
    const inIndex = SECRET_MARKERS.filter((m) => JSON.stringify(rij).includes(m));
    check('секрети не лежать в індексі (tekst/tekst_norm/extra): PRIVATE KEY-тіло, ghp_, sk_live_, password=, JWT', !!rij.titel && inIndex.length === 0, inIndex.length ? `в індексі: ${inIndex.join(',')}` : 'рядок відсутній?');
    const zoekSec = await zoekVia(P, { q: 'toegang server sleutels' });
    const frag = String(zoekSec.data.items?.find((t: ZoekTreffer) => t.id === 'zi-mail-geheim')?.fragment?.tekst || '');
    check('лист із секретом знаходиться за темою, але фрагмент/відповідь без секретів', ids(zoekSec).includes('mail:zi-mail-geheim') && !SECRET_MARKERS.some((m) => zoekSec.body.includes(m)), frag.slice(0, 120));
    const secQ = await Promise.all(['hunter2geheim99', 'sk_live_51HxQQQQ', 'MIIEvQIBADANBg'].map((q) => zoekVia(P, { q })));
    check('пошук за значенням секрету нічого не знаходить', secQ.every((r) => ids(r).length === 0), secQ.map((r) => ids(r).join(',')).join('|'));
    const secSug = await Promise.all(['sk_li', 'ghp_A', 'hunter', 'MIIEv'].map((p) => sug(P, p)));
    check('підказки не підказують секрети', !secSug.some((r) => SECRET_MARKERS.some((m) => r.body.includes(m)) || /hunter2|sk_live_51|ghp_ABC|MIIEvQ/.test(r.body)), secSug.map((r) => r.body.slice(0, 60)).join('|'));

    // ------------------------------------------------------------------ 7. журнал без текстів документів
    const logVoor = logboek.length;
    vang();
    try {
      await zoekVia(P, { q: `${MARKER_A}` }); await zoekVia(P, { q: 'Factuur huur', facets: true }); await sug(P, 'Fact');
      await indexeer(lA, [{ id: 'zi-log-doc', bron: 'cloud', soort: 'bestand', titel: `Logtest ${MARKER_A}log`, tekst: `${MARKER_A}logtekst`, bijgewerktOp: nu, rechten: lA }]);
      await zoekVia(P, { q: 'Logtest' });
    } finally { laat(); }
    const lekLog = logboek.filter((r) => r.includes(MARKER_A) || r.includes('Factuur huur oktober') || r.includes(MARKER_B));
    check('console.* під час індексації й пошуку не містить текстів/назв документів', lekLog.length === 0, `${logboek.length - logVoor} рядків журналу; витік: ${lekLog.slice(0, 2).join(' | ').slice(0, 200)}`);

    // ------------------------------------------------------------------ 8. RLS прямо (роль app)
    // Роль app: з DATABASE_URL_APP (run-test-rls.sh) або — якщо її нема — спроба тим самим хостом/БД під користувачем mijnruimte_app
    // (локальна trust-автентифікація тестового кластера). Без жодної з них — чесне «пропущено» (не рахується як провал, але друкується).
    let app: import('pg').Pool | null = appRolActief() ? getPool('app') : null;
    if (!app) {
      try {
        const u = new URL(String(process.env.DATABASE_URL || '')); u.username = 'mijnruimte_app'; u.password = '';
        const pg = await import('pg'); const kandidaat = new (pg.default ?? pg).Pool({ connectionString: u.toString(), max: 2, connectionTimeoutMillis: 3000 });
        const c = await kandidaat.connect(); const wie = (await c.query('SELECT current_user AS u')).rows[0].u; c.release();
        if (wie === 'mijnruimte_app') app = kandidaat; else await kandidaat.end();
      } catch { app = null; }
    }
    if (app) {
      const als = async (u: string, sql: string, p: unknown[] = []) => { const c = await app.connect(); try { await c.query('BEGIN'); await c.query("SELECT set_config('app.user_id', $1, true)", [u]); return await c.query(sql, p); } finally { await c.query('ROLLBACK').catch(() => undefined); c.release(); } };
      const zA = (await als(B, 'SELECT count(*)::int AS n FROM app.zoek_objecten WHERE user_id = $1', [A])).rows[0].n;
      const zAlle = (await als(B, 'SELECT count(*)::int AS n FROM app.zoek_objecten WHERE user_id = ANY($1)', [[A, B]])).rows[0].n;
      check('RLS zoek_objecten: роль app як B → 0 рядків A; усього видно лише 7 рядків B', zA === 0 && zAlle === 7, `${zA}/${zAlle}`);
      const gA = (await als(B, 'SELECT count(*)::int AS n FROM app.zoek_geschiedenis WHERE user_id = $1', [A])).rows[0].n;
      check('RLS zoek_geschiedenis: роль app як B → 0 рядків A', gA === 0, String(gA));
      let upd = -1; try { upd = (await als(B, `UPDATE app.zoek_objecten SET titel = 'gekaapt' WHERE user_id = $1`, [A])).rowCount || 0; } catch (e) { upd = -2; }
      check('RLS: UPDATE рядків A від імені B → 0 рядків', upd === 0, String(upd));
      let ins = 'ok'; try { await als(B, `INSERT INTO app.zoek_objecten (user_id, ruimte, bron, bron_id, soort, titel) VALUES ($1,'prive','cloud','zi-kaap','bestand','x')`, [A]); } catch (e) { ins = String((e as Error).message).slice(0, 60); }
      check('RLS: INSERT рядка з user_id = A від імені B → відмова (WITH CHECK)', ins !== 'ok', ins);
      const inserts: Record<string, string> = {
        'app.zoek_ocr_tekst': "(user_id, ruimte, sha256, pagina, engine, talen, status, tekst) VALUES ($1,'prive',repeat('a',64),1,'test','ukr','ok','ocrtekstA')",
        'app.zoek_wachtrij': "(user_id, ruimte, bron, bron_id, actie, payload) VALUES ($1,'prive','mail','zi-rls','bijwerken','{}'::jsonb)",
        'app.zoek_bron_stand': "(user_id, ruimte, bron, stand) VALUES ($1,'prive','mail','klaar') ON CONFLICT DO NOTHING",
      };
      for (const tabel of Object.keys(inserts)) {
        const bestaat = (await pool.query('SELECT to_regclass($1) AS t', [tabel])).rows[0].t;
        if (!bestaat) { check(`RLS ${tabel}: таблиця існує (міграція застосована)`, false, 'відсутня'); continue; }
        let insFout = '';
        await pool.query(`INSERT INTO ${tabel} ${inserts[tabel]}`, [A]).catch((e) => { insFout = String(e.message).slice(0, 100); });
        check(`${tabel}: системна роль (cron) може писати (GRANT для mijnruimte_system присутній)`, !insFout, insFout);
        let n = -1, fout = '';
        try { n = (await als(B, `SELECT count(*)::int AS n FROM ${tabel} WHERE user_id = $1`, [A])).rows[0].n; } catch (e) { fout = String((e as Error).message); }
        const geenToegang = /permission denied/i.test(fout);
        check(`RLS ${tabel}: роль app як B → 0 рядків A${geenToegang ? ' (роль app взагалі без доступу — ізольовано)' : ''}`, n === 0 || geenToegang, fout ? fout.slice(0, 100) : String(n));
        if (!insFout) await pool.query(`DELETE FROM ${tabel} WHERE user_id = $1`, [A]).catch(() => undefined);
      }
      const ocrKol = (await pool.query(`SELECT count(*)::int AS n FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname='app' AND c.relname='zoek_ocr_tekst' AND a.attname IN ('user_id','ruimte') AND NOT a.attisdropped`)).rows[0].n;
      check('OCR-кеш 0102 має user_id + ruimte (ключ ізольований по користувачу і простору; 0096-кеш без user_id більше не використовується)', ocrKol === 2, String(ocrKol));
    } else {
      console.log('   ПРОПУЩЕНО: RLS-перевірки прямого SELECT потребують ролі mijnruimte_app (DATABASE_URL_APP або локальна роль на тому самому кластері) — запустіть run-test-rls.sh');
    }
    if (app && !appRolActief()) await app.end().catch(() => undefined);

    // ------------------------------------------------------------------ 9. закритий ключ → індексація нічого не читає/не пише
    const sk = await import('../../backend/sleutelkluis');
    const wq = await import('../../backend/zoek/wachtrij');
    const z2 = await import('../../backend/zoek/bronnen');
    const sessieRij = (await pool.query(`SELECT id FROM app.records WHERE tbl IN ('owner_tab_sessions_v1','owner_service_sessions_v1') AND data->>'userId' = $1 LIMIT 1`, [A])).rows[0];
    let standNa = 'onbekend', uitkomst = '', fout = '', voorN = 0, naN = 0, wachtReden = '';
    try {
      if ((await sk.kluisStand(lA)) === 'uit') await sk.inschakelen(lA, { soort: 'sessie', id: String(sessieRij?.id || randomBytes(8).toString('hex')) });
      sk.sleutelVergrendelenVoorGebruiker(A);
      sk.standCacheLeeg?.(lA);
      standNa = await sk.kluisStand(lA);
      voorN = (await pool.query(`SELECT count(*)::int AS n FROM app.zoek_objecten WHERE user_id=$1 AND ruimte='prive' AND bron IN ('mail','bijlage','drive')`, [A])).rows[0].n;
      const q = (sql: string, p: unknown[] = []) => pool.query(sql, p) as never;
      await wq.zoekMelden(q, [{ userId: A, ruimte: 'prive', bron: 'mail', bronId: wq.VOLLEDIG_ID, actie: 'volledig' }]);
      const item = (await wq.zoekOphalen(q, 50)).find((i) => i.userId === A && i.bron === 'mail');
      if (!item) throw new Error('GEEN_WACHTITEM');
      uitkomst = await z2.verwerkWachtItem(item);
      const rij = (await pool.query('SELECT status, last_error FROM app.zoek_wachtrij WHERE id = $1', [item.id])).rows[0];
      fout = rij ? `wachtrij: ${rij.status} ${rij.last_error}` : '';
      if (/^wachtrij: wachtend SLEUTEL/.test(fout)) fout = '';
      naN = (await pool.query(`SELECT count(*)::int AS n FROM app.zoek_objecten WHERE user_id=$1 AND ruimte='prive' AND bron IN ('mail','bijlage','drive')`, [A])).rows[0].n;
      wachtReden = String((await pool.query(`SELECT wacht_reden FROM app.zoek_bron_stand WHERE user_id=$1 AND ruimte='prive' AND bron='mail'`, [A]).catch(() => ({ rows: [{}] }))).rows[0]?.wacht_reden || '');
    } catch (e) { fout = String((e as Error).message); }
    check(`закритий ключ (kluisStand=${standNa}): елемент черги «mail volledig» → uitgesteld, нічого не додано, причина SLEUTELKLUIS_GESLOTEN у стані`,
      standNa === 'gesloten' && uitkomst === 'uitgesteld' && naN === voorN && /SLEUTEL/i.test(wachtReden) && !fout, `${standNa} ${uitkomst} ${voorN}→${naN} reden=${wachtReden} ${fout.slice(0, 100)}`);
    await pool.query('DELETE FROM app.sleutelkluis_omslag WHERE user_id = $1', [A]).catch(() => undefined);
    await pool.query('DELETE FROM app.sleutelkluis WHERE user_id = $1', [A]).catch(() => undefined);
    sk.standCacheLeeg?.(lA);
  } catch (e) {
    check('несподівана помилка', false, String((e as Error)?.stack || e));
  } finally {
    laat();
    G.herstel();
    for (const sql of ['DELETE FROM app.zoek_objecten WHERE user_id = ANY($1)', 'DELETE FROM app.zoek_geschiedenis WHERE user_id = ANY($1)', 'DELETE FROM app.zoek_bron_stand WHERE user_id = ANY($1)', 'DELETE FROM app.zoek_wachtrij WHERE user_id = ANY($1)', 'DELETE FROM app.zoek_ocr_tekst WHERE user_id::text = ANY($1)',
      'DELETE FROM app.tech_activaties WHERE user_id = ANY($1)', 'DELETE FROM app.tech_profielen WHERE user_id = ANY($1)', 'DELETE FROM app.ruimte_dienst_stand WHERE user_id = ANY($1)', 'DELETE FROM app.ruimte_keuze WHERE user_id = ANY($1)']) {
      await pool.query(sql, [opruim]).catch(() => undefined);
    }
  }
  return einde();
}
