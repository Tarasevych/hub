// SEC-002, laatste correctie «v» (13.11.2026): regressietests voor de bevindingen van de slot-toets en de huis-omgeving.
// SEC-002, останнє виправлення «v»: перевірки за висновками slot-toets.
//  A. «Лише перегляд» op de intrekroutes (KIJKER_INTREKKEN) raakt alleen EIGEN toegang (slot-toets 1, MIDDEN):
//     share/revoke — een kijker die in een gedeelde ruimte beheerder is, haalt geen ANDER lid weg (403 RBAC_FORBIDDEN, lid blijft,
//     auditregel rbac.geweigerd met reden KIJKER_ALLEEN_EIGEN, melding toegang_alleen_lezen); zelf vertrekken mag wel.
//     share/link/revoke — een koppeling van een ander: 403 en ze blijft geldig; een koppeling die hij zelf maakte: 200.
//     extensie-beheer/intrekken — de ontgrendeling van een ANDER account: 403 (ook voor een onbekend id: geen orakel); eigen: geen 403.
//     Wie geen kijker is, beslist zoals vroeger (eigenaar van de ruimte haalt een lid weg: 200).
//  B. xlsx-lezer lineair met EXACT dezelfde uitkomst (slot-toets 2, LAAG): elke oude expressie ↔ nieuwe functie op willekeurige en
//     vijandige invoer; de hele xlsx-pijplijn ↔ de oude pijplijn; vijandige xlsx via tekstKern binnen de tijd.
//  C. Huis-testhulp: de nagebootste Home Assistant heeft op elke machine een privé-adres; de adapter blijft loopback, documentatie-
//     /publieke http-adressen en niet-vermelde toestellen weigeren (de oorzaak van «instellen: ADRES_GEWEIGERD» lag in de omgeving).
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { checker } from './hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { registreerMelder } from '../../backend/melder';
import { tekstKern, xlsxBlokken, xlsxSi, xlsxT, xlsxTagMetTweeAttributen, xlsxUitXml, xlsxV, xmlNaarTekst } from '../../backend/zoek/tekst-kern';
import { haVerbinden, veiligAdres } from '../../backend/huis-adapter-thuis-assistent';
import { adresSoort } from '../../shared/extern-bureaublad';
import { ENTITEITEN, nepHomeAssistant, VIRTUEEL_LAN_ADRES } from './hulp/nep-thuis-assistent';

type Res = { statusCode: number; body: string };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

// ------------------------------------------------------------------ de OUDE xlsx-pijplijn (letterlijk van vóór slot v), om te vergelijken
const schoonOud = (t: string, max: number) => t.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').replace(/(?<![ \t\f\v])[ \t\f\v]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const OUD = {
  si: (s: string) => [...s.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => m[1]),
  row: (s: string) => [...s.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((m) => m[1]),
  c: (s: string) => [...s.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map((m) => [m[1], m[2]]),
  t: (s: string) => (s.match(/\bt="([^"]*)"/) || [])[1],
  v: (s: string) => (s.match(/<v>([\s\S]*?)<\/v>/) || [])[1],
  sheet: (s: string) => [...s.matchAll(/<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="([^"]*)"/g)].map((m) => [m[1], m[2]]),
  rel: (s: string) => [...s.matchAll(/<Relationship\b[^>]*\bId="([^"]*)"[^>]*\bTarget="([^"]*)"/g)].map((m) => [m[1], m[2]]),
};
const NIEUW: Record<keyof typeof OUD, (s: string) => unknown> = {
  si: (s) => [...xlsxSi(s)], row: (s) => [...xlsxBlokken(s, 'row')].map(([, b]) => b), c: (s) => [...xlsxBlokken(s, 'c')], t: xlsxT, v: xlsxV,
  sheet: (s) => [...xlsxTagMetTweeAttributen(s, 'sheet', 'name', 'r:id')], rel: (s) => [...xlsxTagMetTweeAttributen(s, 'Relationship', 'Id', 'Target')],
};
function xlsxOud(xml: (p: string) => string, paden: string[], max: number) {
  const sst: string[] = []; const sstXml = xml('xl/sharedStrings.xml');
  for (const m of sstXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) sst.push(xmlNaarTekst(m[1], 10_000).replace(/\n/g, ' '));
  const wb = xml('xl/workbook.xml'); const namen = [...wb.matchAll(/<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="([^"]*)"/g)].map((m) => ({ naam: m[1], rid: m[2] }));
  const rels = xml('xl/_rels/workbook.xml.rels'); const relMap = new Map([...rels.matchAll(/<Relationship\b[^>]*\bId="([^"]*)"[^>]*\bTarget="([^"]*)"/g)].map((m) => [m[1], m[2].replace(/^\/?(xl\/)?/, '')]));
  const bladen = paden.filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p)).sort();
  const paginas: Array<{ nr: number; tekst: string }> = []; let i = 0;
  const lees = (pad: string, titel: string) => {
    const s = xml(pad); const rijen: string[] = [];
    for (const rij of s.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cellen: string[] = [];
      for (const c of rij[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const t = (c[1].match(/\bt="([^"]*)"/) || [])[1] || '';
        const v = (c[2].match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (t === 's' && v !== undefined) cellen.push(sst[Number(v)] ?? '');
        else if (t === 'inlineStr') cellen.push(xmlNaarTekst(c[2], 10_000).replace(/\n/g, ' '));
        else if (v !== undefined) cellen.push(xmlNaarTekst(v, 1000));
      }
      if (cellen.some((x) => x.trim())) rijen.push(cellen.join('\t'));
      if (rijen.length >= 20_000) break;
    }
    paginas.push({ nr: ++i, tekst: schoonOud(`${titel}\n${rijen.join('\n')}`, max) });
  };
  if (namen.length) for (const n of namen) { const doel = relMap.get(n.rid); if (doel && paden.includes(`xl/${doel}`)) lees(`xl/${doel}`, n.naam); }
  else for (const b of bladen) lees(b, b.replace(/^xl\/worksheets\//, '').replace(/\.xml$/, ''));
  return { tekst: schoonOud(paginas.map((p) => p.tekst).join('\n\n'), max), paginas };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-slot-v-20261113');

  // ================================================================ B. xlsx (zonder database)
  {
    let zaad = 20261113;
    const rnd = () => { zaad = (zaad * 1664525 + 1013904223) >>> 0; return zaad / 2 ** 32; };
    const kies = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
    const NUL = String.fromCharCode(0);
    const TOK = ['<si>', '</si>', '<si', '<row', '<row>', '<rows>', '</row>', '</row', '<c', '<c>', '<col>', '<c:x', '</c>', '<v>', '</v>', ' t="', 't="', 'xt="', '"', '>', ' ', '\n', 'a', 'Z', '_', '9', 's', 'inlineStr',
      '<sheet', '<sheets>', '<sheet ', ' name="', 'name="', 'xname="', ' r:id="', 'r:id="', 'xr:id="', '<Relationship', '<Relationships>', ' Id="', 'Id="', ' Target="', 'Target="', '/>', '<', 'ſ', 'K', NUL, '-', ':'];
    const DICHT_REL = ['<Relationship', '<Relationship ', ' Id="', 'Id="', 'xId="', ' Target="', 'Target="', '"', '"', '>', '>', ' ', 'a', '<Relationships'];
    const DICHT = ['<sheet', '<sheet ', ' name="', 'name="', 'aname="', ' r:id="', 'r:id="', '"', '"', '>', '>', ' ', 'a', 'x', '<sheets', '\n'];
    const maak = (tok: readonly string[], lang: number) => { let s = ''; const n = 1 + Math.floor(rnd() * lang); for (let i = 0; i < n; i++) s += kies(tok); return s; };
    const afwijking: Record<string, string> = {}; const treffers: Record<string, number> = {};
    const vergelijk = (s: string) => {
      for (const k of Object.keys(OUD) as Array<keyof typeof OUD>) {
        const a = JSON.stringify(OUD[k](s)), b = JSON.stringify(NIEUW[k](s));
        if (a !== '[]' && a !== undefined) treffers[k] = (treffers[k] || 0) + 1;
        if (a !== b && !afwijking[k]) afwijking[k] = `${JSON.stringify(s)} oud=${a} nieuw=${b}`;
      }
    };
    for (let i = 0; i < 20_000; i++) vergelijk(maak(TOK, rnd() < 0.2 ? 120 : 30));
    for (let i = 0; i < 20_000; i++) vergelijk(maak(DICHT, 40));
    for (let i = 0; i < 10_000; i++) vergelijk(maak(DICHT_REL, 40));
    const genoeg = ['si', 'row', 'c', 't', 'v', 'sheet', 'rel'].every((k) => (treffers[k] || 0) > 50);
    check('B: 50 000 willekeurige stukken — elke nieuwe lineaire functie geeft EXACT dezelfde treffers als de oude expressie (si, row, c, t, v, sheet, Relationship)',
      Object.keys(afwijking).length === 0 && genoeg, Object.keys(afwijking).length ? JSON.stringify(afwijking).slice(0, 600) : JSON.stringify(treffers));

    // hele pijplijn: willekeurige werkmappen (deels geldig, deels kapot) → zelfde tekst en pagina's als de oude pijplijn
    const CEL = ['<c r="A1" t="s"><v>0</v></c>', '<c t="s"><v>1</v></c>', '<c t="inlineStr"><is><t>Inline ' + 'ſK' + '</t></is></c>', '<c><v>42</v></c>', '<c t="n"><v>3.5</v>', '<c t="s"><v>9</v></c>',
      '<c t="str"><f>A1</f><v>som</v></c>', '<c/>', '<c>', '</c>', '<v>', '</v>', ' ', '&amp;', '<row r="2">', '</row>', '<c t="', '"'];
    const RIJ = () => `<row r="${Math.floor(rnd() * 9)}">${maak(CEL, 8)}${rnd() < 0.85 ? '</row>' : ''}`;
    let pijplijnAfwijking = '';
    for (let w = 0; w < 1500 && !pijplijnAfwijking; w++) {
      const bladen = 1 + Math.floor(rnd() * 3);
      const bestanden: Record<string, string> = {
        'xl/sharedStrings.xml': `<sst>${Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, i) => rnd() < 0.9 ? `<si><t>Tekst ${i} &lt;x&gt;</t></si>` : '<si><t>open').join('')}</sst>`,
      };
      if (rnd() < 0.7) {
        bestanden['xl/workbook.xml'] = `<workbook><sheets>${Array.from({ length: bladen }, (_, i) => rnd() < 0.9 ? `<sheet name="Blad ${i + 1}" sheetId="${i + 1}" r:id="rId${i + 1}"/>` : maak(DICHT, 6)).join('')}</sheets></workbook>`;
        bestanden['xl/_rels/workbook.xml.rels'] = `<Relationships>${Array.from({ length: bladen }, (_, i) => rnd() < 0.9 ? `<Relationship Id="rId${i + 1}" Type="x" Target="${rnd() < 0.5 ? '/xl/' : ''}worksheets/sheet${i + 1}.xml"/>` : '<Relationship Id="rId9').join('')}</Relationships>`;
      }
      for (let i = 1; i <= bladen; i++) bestanden[`xl/worksheets/sheet${i}.xml`] = `<worksheet><sheetData>${Array.from({ length: Math.floor(rnd() * 6) }, RIJ).join('')}</sheetData></worksheet>`;
      const paden = Object.keys(bestanden); const xml = (p: string) => bestanden[p] ?? '';
      const max = kies([200_000, 50, 7]);
      const a = JSON.stringify(xlsxOud(xml, paden, max)), b = JSON.stringify(xlsxUitXml(xml, paden, max));
      if (a !== b) pijplijnAfwijking = `${JSON.stringify(bestanden).slice(0, 400)} oud=${a.slice(0, 200)} nieuw=${b.slice(0, 200)}`;
    }
    check('B: 1 500 willekeurige werkmappen — xlsxUitXml geeft dezelfde tekst en pagina\'s als de oude pijplijn', !pijplijnAfwijking, pijplijnAfwijking);

    // vijandig: ~200 kB zonder sluittags / zonder «>» / zonder r:id — elk binnen 1 s (de oude expressies: seconden tot minuten)
    const K = 200_000;
    const VIJAND: Record<string, string> = {
      '<si> zonder </si>': '<si>'.repeat(K / 4), '<row> zonder </row>': '<row>'.repeat(K / 5), '<c> zonder </c>': '<c>'.repeat(K / 3), '<row zonder >': '<row '.repeat(K / 5),
      '<v> zonder </v>': '<v>'.repeat(K / 3), 'sheet name zonder r:id': '<sheet name="a" '.repeat(K / 16), '<sheet zonder >': '<sheet '.repeat(K / 7),
      'Relationship zonder Target': '<Relationship Id="a" '.repeat(K / 20), 'r:id zonder "': '<sheet name="a" r:id="'.repeat(K / 22),
    };
    let traagst = 0, welke = '';
    for (const [n, s] of Object.entries(VIJAND)) {
      const t0 = performance.now();
      void [...xlsxSi(s)]; void [...xlsxBlokken(s, 'row')]; void [...xlsxBlokken(s, 'c')]; xlsxV(s); xlsxT(s);
      void [...xlsxTagMetTweeAttributen(s, 'sheet', 'name', 'r:id')]; void [...xlsxTagMetTweeAttributen(s, 'Relationship', 'Id', 'Target')];
      const d = performance.now() - t0; if (d > traagst) { traagst = d; welke = n; }
    }
    check('B: vijandige invoer van ~200 kB (zonder sluittag, zonder «>», zonder r:id) — alle zeven lezers samen binnen 1 s per invoer', traagst < 1000, `traagste ${Math.round(traagst)} ms (${welke})`);

    // via de echte ingang: een kleine xlsx (compressie!) met 2 MB «<si>» en «<row>» zonder sluittag
    // Ruis (willekeurige hex) houdt de compressieverhouding onder de archiefgrens van 200×; de eerste rij en tekenreeks zijn geldig.
    const ruis = () => `<!--${randomBytes(12_000).toString('hex')}-->`;
    const vijandXlsx = zipSync({
      '[Content_Types].xml': strToU8('<Types/>'), 'xl/sharedStrings.xml': strToU8(`<sst><si><t>Vijandig</t></si>${'<si>'.repeat(150_000)}${ruis()}`),
      'xl/worksheets/sheet1.xml': strToU8(`<sheetData><row r="1"><c t="s"><v>0</v></c></row>${'<row><c>'.repeat(75_000)}${ruis()}`),
    });
    const t1 = performance.now();
    const u1 = await tekstKern(vijandXlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'vijand.xlsx') as { status?: string; tekst?: string };
    const d1 = performance.now() - t1;
    check('B: tekstKern op een vijandige xlsx (600 kB «<si>»/«<row><c>» zonder sluittag) is binnen 5 s klaar en leest de geldige rij (vroeger tientallen seconden: de zoekwerker liep tegen zijn tijdslimiet)',
      d1 < 5000 && /Vijandig/.test(u1.tekst || ''), `${Math.round(d1)} ms, ${vijandXlsx.byteLength} B, status ${u1.status}, tekst ${JSON.stringify((u1.tekst || '').slice(0, 60))}`);
    const gewoon = zipSync({
      '[Content_Types].xml': strToU8('<Types/>'), 'xl/sharedStrings.xml': strToU8('<sst><si><t>Hallo</t></si><si><t>Привіт</t></si></sst>'),
      'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Overzicht" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/></Relationships>'),
      'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1"><v>42</v></c></row></sheetData></worksheet>'),
    });
    const u2 = await tekstKern(gewoon, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'gewoon.xlsx') as { tekst?: string };
    check('B: een gewone xlsx levert nog steeds bladnaam en celwaarden (Overzicht / Hallo, Привіт, 42)', /Overzicht/.test(u2.tekst || '') && /Hallo\tПривіт\t42/.test(u2.tekst || ''), JSON.stringify((u2.tekst || '').slice(0, 120)));
  }

  // ================================================================ C. huis: testhulp met privé-adres, adapter onveranderd streng
  {
    const TOKEN = `tok_${randomBytes(12).toString('hex')}`;
    const ha = await nepHomeAssistant({ token: TOKEN, entiteiten: ENTITEITEN });
    const oud = process.env.HUIS_VERTROUWDE_TOESTELLEN;
    try {
      const host = new URL(ha.url).hostname;
      check('C: de nagebootste bron heeft op elke machine hetzelfde PRIVÉ-adres (RFC 1918), niet het adres van de container', host === VIRTUEEL_LAN_ADRES && adresSoort(host) === 'prive', `${host} ${adresSoort(host)}`);
      check('C: de adapter blijft streng — loopback, 192.0.2.x/publiek via http en het beheersubnet worden geweigerd (geen versoepeling)',
        !veiligAdres('http://127.0.0.1:8123').ok && !veiligAdres('http://192.0.2.2:8123').ok && !veiligAdres('http://8.8.8.8:8123').ok && veiligAdres(ha.url).ok);
      delete process.env.HUIS_VERTROUWDE_TOESTELLEN;
      const zonder = await haVerbinden(ha.url, TOKEN);
      const naZonder = ha.s.aanroepen.length;
      process.env.HUIS_VERTROUWDE_TOESTELLEN = ha.url;
      const met = await haVerbinden(ha.url, TOKEN);
      const naMet = ha.s.aanroepen.length;
      const viaLoopback = await haVerbinden(ha.url.replace(VIRTUEEL_LAN_ADRES, '127.0.0.1'), TOKEN);
      check('C: niet vermeld → TOESTEL_NIET_VERTROUWD zonder aanroep; vermeld toestel → verbonden; hetzelfde toestel via loopback → ADRES_GEWEIGERD',
        !zonder.ok && zonder.fout === 'TOESTEL_NIET_VERTROUWD' && met.ok && met.locatie === 'Proefhuis' && !viaLoopback.ok && viaLoopback.fout === 'ADRES_GEWEIGERD' && naZonder === 0 && naMet > 0 && ha.s.aanroepen.length === naMet,
        JSON.stringify({ zonder, met, viaLoopback, naZonder, naMet, aanroepen: ha.s.aanroepen.length }));
    } finally {
      if (oud === undefined) delete process.env.HUIS_VERTROUWDE_TOESTELLEN; else process.env.HUIS_VERTROUWDE_TOESTELLEN = oud;
      await ha.stop();
    }
  }

  // ================================================================ A. kijker en «alleen eigen» (met database)
  const metDb = Boolean(process.env.DATABASE_URL_SYSTEM || process.env.DATABASE_URL);
  if (!metDb) { console.log('OVERGESLAGEN (geen database): A'); return einde(); }
  const sys = getPool('systeem');
  const meldingen: Array<{ userId: string; kind: string; title: string }> = [];
  const { handler } = await import('../../backend/index');
  const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identiteit');
  const kl = await import('../../backend/kijker-alleen-lezen');
  registreerMelder(async (userId, _e, kind, title) => { meldingen.push({ userId, kind, title }); });
  const sfx = randomBytes(4).toString('hex');
  const rijen: string[] = [];
  const mens = async (naam: string) => {
    const id = randomUUID(); rijen.push(id);
    await sys.query(`INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)`, [id, { email: `slot-v-${naam}-${sfx}@test.invalid`, role: 'member', status: 'approved', accessLevel: 'full', name: naam }]);
    return { id, email: `slot-v-${naam}-${sfx}@test.invalid` };
  };
  const sessie = async (userId: string, dienst = 'hub') => {
    const token = randomBytes(32).toString('base64url'); const now = Date.now(); const id = randomUUID(); rijen.push(id);
    await sys.query(`INSERT INTO app.records (tbl,id,data) VALUES ('owner_service_sessions_v1',$1,$2)`, [id, { id, tokenHash: sha(token), userId, service: dienst, sourceOrigin: `https://${dienst}.tarasevych.com`, tabHash: sha('x'), createdAt: now, authenticatedAt: now, lastSeenAt: now, idleExpiresAt: now + 864e5, absoluteExpiresAt: now + 864e5, rotation: 0, version: 1, revocationEpoch: 999999, scope: 'ecosystem', userAgent: 'proef' }]);
    return `${id}.${token}`;
  };
  const roep = async (cookie: string, pad: string, body: Record<string, unknown> = {}, host = 'hub') => {
    const r = await handler({
      headers: { host: `${host}.tarasevych.com`, origin: `https://${host}.tarasevych.com`, 'content-type': 'application/json', cookie: `${ECOSYSTEM_COOKIE}=${encodeURIComponent(cookie)}`, 'user-agent': 'proef' },
      body: JSON.stringify({ service: host, sourceOrigin: `https://${host}.tarasevych.com`, tabContext: 'a'.repeat(48), ...body }), isBase64Encoded: false, rawPath: pad, rawQueryString: '', queryStringParameters: {},
      requestContext: { http: { method: 'POST', path: pad, sourceIp: '203.0.113.92', userAgent: 'proef' } },
    } as never) as Res;
    let data: Record<string, any> = {}; try { data = JSON.parse(r.body || '{}'); } catch { /* geen JSON */ }
    return { status: r.statusCode, data, code: String(data.error || '') };
  };
  const weigeringen = async (userId: string, route: string) => (await sys.query(`SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = 'rbac.geweigerd' AND details->>'reden' = 'KIJKER_ALLEEN_EIGEN' AND details->>'route' = $2`, [userId, route])).rows[0].n as number;
  let ws = '';
  try {
    const O = await mens('o'), V = await mens('v'), M = await mens('m');
    const cO = await sessie(O.id), cV = await sessie(V.id), cM = await sessie(M.id);
    ws = String((await roep(cO, '/api/workspace/load')).data.workspace?.id || '');
    await roep(cV, '/api/workspace/load'); await roep(cM, '/api/workspace/load');
    const sV = await roep(cO, '/api/share/email', { workspaceId: ws, email: V.email, workspaceRole: 'admin' });
    const sM = await roep(cO, '/api/share/email', { workspaceId: ws, email: M.email, workspaceRole: 'member' });
    const leden = async () => ((await roep(cO, '/api/share/members', { workspaceId: ws })).data.members || []) as Array<{ id: string; userId: string; status: string; workspaceRole: string }>;
    const lidV = (await leden()).find((l) => l.userId === V.id), lidM = (await leden()).find((l) => l.userId === M.id);
    const linkO = await roep(cO, '/api/share/link', { workspaceId: ws, workspaceRole: 'viewer' });
    const linkV = await roep(cV, '/api/share/link', { workspaceId: ws, workspaceRole: 'viewer' }); // als beheerder, vóór de verlaging
    check('A: voorbereiding — V beheerder en M lid van de ruimte van O, twee deelkoppelingen (van O en van V)',
      ws !== '' && sV.status === 200 && sM.status === 200 && lidV?.status === 'active' && lidV?.workspaceRole === 'admin' && lidM?.status === 'active' && linkO.status === 200 && linkV.status === 200,
      JSON.stringify({ ws: !!ws, sV: sV.status, sM: sM.status, lidV, lidM, linkO: linkO.status, linkV: linkV.status }));

    // V wordt op de site «лише перегляд»
    await sys.query(`UPDATE app.records SET data = data || '{"role":"viewer","accessLevel":"limited"}'::jsonb WHERE tbl = 'users' AND id = $1`, [V.id]);
    meldingen.length = 0; kl._kijkerMeldingLeeg();
    const wegM = await roep(cV, '/api/share/revoke', { workspaceId: ws, memberId: lidM?.id });
    const nogM = (await leden()).some((l) => l.userId === M.id);
    check('A: kijker (beheerder in de ruimte) haalt een ANDER lid weg → 403 RBAC_FORBIDDEN, het lid blijft', wegM.status === 403 && wegM.code === 'RBAC_FORBIDDEN' && nogM, `${wegM.status} ${wegM.code} lid=${nogM}`);
    check('A: … met een auditregel rbac.geweigerd (reden KIJKER_ALLEEN_EIGEN) en de melding toegang_alleen_lezen (uk / nl)',
      (await weigeringen(V.id, 'POST /api/share/revoke')) === 1 && meldingen.some((m) => m.userId === V.id && m.kind === 'toegang_alleen_lezen' && /лише перегляд/.test(m.title) && /alleen-lezen/.test(m.title)),
      JSON.stringify(meldingen.map((m) => m.kind)));
    const intrekO = await roep(cV, '/api/share/link/revoke', { workspaceId: ws, code: linkO.data.code });
    const openO = (await sys.query(`SELECT revoked_at FROM app.invites WHERE code = $1`, [linkO.data.code])).rows[0];
    check('A: kijker trekt de deelkoppeling van een ANDER in → 403 RBAC_FORBIDDEN, de koppeling blijft geldig, auditregel',
      intrekO.status === 403 && intrekO.code === 'RBAC_FORBIDDEN' && !!openO && openO.revoked_at === null && (await weigeringen(V.id, 'POST /api/share/link/revoke')) === 1, `${intrekO.status} ${intrekO.code} ${JSON.stringify(openO)}`);
    const intrekV = await roep(cV, '/api/share/link/revoke', { workspaceId: ws, code: linkV.data.code });
    const dichtV = (await sys.query(`SELECT revoked_at FROM app.invites WHERE code = $1`, [linkV.data.code])).rows[0];
    check('A: kijker trekt zijn EIGEN deelkoppeling in → 200 (eigen toegang sluiten blijft open)', intrekV.status === 200 && !!dichtV?.revoked_at, `${intrekV.status} ${intrekV.code}`);
    const rol = await roep(cV, '/api/share/role', { workspaceId: ws, memberId: lidM?.id, workspaceRole: 'viewer' });
    check('A: controle — rol van een ander wijzigen blijft 403 RBAC_FORBIDDEN', rol.status === 403 && rol.code === 'RBAC_FORBIDDEN', `${rol.status} ${rol.code}`);
    const zelf = await roep(cV, '/api/share/revoke', { workspaceId: ws, memberId: lidV?.id });
    const nogV = (await leden()).some((l) => l.userId === V.id);
    check('A: kijker verlaat de gedeelde ruimte ZELF → 200 en is geen lid meer', zelf.status === 200 && !nogV, `${zelf.status} ${zelf.code} lid=${nogV}`);
    const eigM = await roep(cO, '/api/share/revoke', { workspaceId: ws, memberId: lidM?.id });
    check('A: wie geen kijker is, beslist zoals vroeger — de eigenaar van de ruimte haalt een lid weg → 200', eigM.status === 200 && !(await leden()).some((l) => l.userId === M.id), `${eigM.status} ${eigM.code}`);

    // extensie-beheer/intrekken: alleen de eigen ontgrendeling
    const R = 'POST /api/owner/agents/extensie-beheer/intrekken';
    const cVm = await sessie(V.id, 'mcp'), cMm = await sessie(M.id, 'mcp');
    const vreemd = await roep(cVm, '/api/owner/agents/extensie-beheer/intrekken', { userId: M.id }, 'mcp');
    const onbekend = await roep(cVm, '/api/owner/agents/extensie-beheer/intrekken', { userId: randomUUID() }, 'mcp');
    const eigen = await roep(cVm, '/api/owner/agents/extensie-beheer/intrekken', { userId: V.id }, 'mcp');
    const lid = await roep(cMm, '/api/owner/agents/extensie-beheer/intrekken', { userId: O.id }, 'mcp');
    check('A: extensie-beheer/intrekken — kijker voor een ANDER account (ook een onbekend id: geen orakel) → 403 RBAC_FORBIDDEN met auditregel',
      vreemd.status === 403 && vreemd.code === 'RBAC_FORBIDDEN' && onbekend.status === 403 && onbekend.code === 'RBAC_FORBIDDEN' && (await weigeringen(V.id, R)) >= 1,
      `${vreemd.status} ${vreemd.code} | ${onbekend.status} ${onbekend.code}`);
    check('A: extensie-beheer/intrekken — kijker voor ZICHZELF en een gewoon lid gaan langs de kijkerwacht (de module beslist, geen RBAC_FORBIDDEN)',
      eigen.code !== 'RBAC_FORBIDDEN' && eigen.status !== 500 && lid.code !== 'RBAC_FORBIDDEN' && lid.status !== 500, `${eigen.status} ${eigen.code} | ${lid.status} ${lid.code}`);

    // puur: kijkerAlleenEigen
    let gegooid = false; try { kl.kijkerAlleenEigen({ id: 'x', role: 'viewer', status: 'approved' }, false); } catch (e) { gegooid = e instanceof kl.KijkerWeigering; }
    let lidGegooid = false; try { kl.kijkerAlleenEigen({ id: 'x', role: 'member', status: 'approved' }, false); kl.kijkerAlleenEigen({ id: 'x', role: 'viewer', status: 'approved' }, true); } catch { lidGegooid = true; }
    check('A: kijkerAlleenEigen — kijker en niet eigen → KijkerWeigering; eigen, of geen kijker → niets', gegooid && !lidGegooid);
  } finally {
    await sys.query(`DELETE FROM app.records WHERE id = ANY($1::text[]) OR (tbl = 'workspace_members' AND data->>'workspaceId' = $2)`, [rijen, ws]).catch(() => undefined);
  }
  return einde();
}
