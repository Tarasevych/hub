// VERWIJZING-001: посилання з людською назвою, підсумком і станом для гілок, запитів на злиття, комітів, міграцій і задач.
// Verwijzingen met mensentitel, samenvatting en staat (samengevoegd, gesloten, verwijderd: wie, wanneer, waarom) — nooit een kaal nummer of een 404.
//
// Два джерела:
//  1) історія git (офлайн): коміти злиття, вершини гілок, файли міграцій і задач;
//  2) реєстр подій orchestratie/verwijzingen/ — лише доповнюється: хто, коли й чому видалив гілку чи закрив запит, куди ввійшла робота,
//     людська назва й підсумок. Записи не редагують, новіший запис про те саме перекриває старіший.
import { fout, waarsch } from './bijdragen.mjs';

export const VERWIJZINGEN_MAP = 'orchestratie/verwijzingen';
export const VERWIJZING_SOORTEN = ['pr', 'tak', 'commit', 'migratie', 'taak'];
export const VERWIJZING_STATEN = ['open', 'samengevoegd', 'gesloten', 'verwijderd', 'onbekend'];
/** Події реєстру. beschrijving — лише назва й підсумок без зміни стану. */
export const GEBEURTENISSEN = ['verwijderd', 'gesloten', 'samengevoegd', 'hersteld', 'beschrijving'];
export const MANIFEST_VERWIJZINGEN_MAX = 300;

const TAAK_RE = /^[A-Z][A-Z0-9]{1,9}-\d{3,5}$/;
const SHA_RE = /^[0-9a-f]{7,40}$/;
const TAK_RE = /^(?!-)(?!.*\.\.)[A-Za-z0-9._\/-]{1,200}$/;
const RUSSISCH = /[ЁёЪъЫыЭэ]/;
const kort = (t, n) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s; };
/** Коротка людська назва: перша змістовна частина речення (до крапки, двокрапки чи дужки), не довша за 90 знаків. */
export function korteTitel(t, n = 90) {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim(); if (!s) return '';
  const deel = s.split(/(?<=[^0-9A-Z])[.:;](?:\s|$)|\s\(|\s[—–]\s/)[0].trim();
  return kort(deel.length >= 12 ? deel : s, n);
}
const tekstVeld = (x, n) => (x && typeof x.uk === 'string' && x.uk.trim() ? { uk: kort(x.uk, n), ...(typeof x.nl === 'string' && x.nl.trim() ? { nl: kort(x.nl, n) } : {}) } : null);
export const slugVoor = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'x';
export const sleutel = (soort, id) => `${soort}:${soort === 'pr' ? Number(id) : String(id)}`;

/** Перевірка одного запису реєстру. */
export function valideerGebeurtenis(r, { pad = 'запис' } = {}) {
  const z = []; const f = (code, uk, nl) => z.push(fout(code, `${pad}: ${uk}`, `${pad}: ${nl}`));
  if (!r || typeof r !== 'object') { f('VERWIJZING_VORM', 'очікується JSON-об’єкт', 'JSON-object verwacht'); return z; }
  if (r.schema !== 1) f('VERWIJZING_SCHEMA', 'schema має бути 1', 'schema moet 1 zijn');
  if (!['pr', 'tak'].includes(r.soort)) f('VERWIJZING_SOORT', 'soort: pr або tak', 'soort: pr of tak');
  if (r.soort === 'pr' && !(Number.isInteger(r.id) && r.id > 0)) f('VERWIJZING_ID', 'номер запиту на злиття — ціле число', 'PR-nummer is een geheel getal');
  if (r.soort === 'tak' && !(typeof r.id === 'string' && TAK_RE.test(r.id))) f('VERWIJZING_ID', 'назва гілки без пробілів і «..»', 'taknaam zonder spaties en «..»');
  if (!GEBEURTENISSEN.includes(r.gebeurtenis)) f('VERWIJZING_GEBEURTENIS', `подія: ${GEBEURTENISSEN.join(', ')}`, `gebeurtenis: ${GEBEURTENISSEN.join(', ')}`);
  if (typeof r.tijd !== 'string' || Number.isNaN(Date.parse(r.tijd))) f('VERWIJZING_TIJD', 'час ISO 8601', 'tijd in ISO 8601');
  if (!r.wie || typeof r.wie.naam !== 'string' || r.wie.naam.trim().length < 2) f('VERWIJZING_WIE', 'хто зробив: wie.naam (людина або агент)', 'wie: wie.naam');
  const moetWaarom = ['verwijderd', 'gesloten', 'hersteld'].includes(r.gebeurtenis);
  if (moetWaarom && !(r.waarom && typeof r.waarom.uk === 'string' && r.waarom.uk.trim().length >= 10)) f('VERWIJZING_WAAROM', 'для видалення, закриття й повернення потрібна причина українською (≥ 10 символів)', 'reden verplicht (≥ 10 tekens)');
  if (r.gebeurtenis === 'verwijderd' && r.soort === 'tak' && !(typeof r.laatsteCommit === 'string' && SHA_RE.test(r.laatsteCommit))) f('VERWIJZING_LAATSTE', 'для видаленої гілки потрібен останній коміт (laatsteCommit), щоб її можна було відкрити й відновити', 'laatste commit verplicht bij een verwijderde tak');
  if (r.gebeurtenis === 'beschrijving' && !r.titel?.uk) f('VERWIJZING_TITEL', 'опис без людської назви (titel.uk)', 'beschrijving zonder titel.uk');
  if (r.laatsteCommit !== undefined && r.laatsteCommit !== null && !(typeof r.laatsteCommit === 'string' && SHA_RE.test(r.laatsteCommit))) f('VERWIJZING_LAATSTE', 'laatsteCommit — шістнадцятковий ідентифікатор коміту', 'laatsteCommit is een commit-hash');
  if (r.taken !== undefined && !(Array.isArray(r.taken) && r.taken.every((t) => TAAK_RE.test(t)))) f('VERWIJZING_TAKEN', 'taken — список ідентифікаторів задач ABC-001', 'taken: lijst van taak-id’s');
  for (const veld of ['titel', 'samenvatting', 'waarom']) {
    const v = r[veld]; if (!v) continue;
    if (typeof v.uk !== 'string' || !/[\u0400-\u04FF]/.test(v.uk)) f('VERWIJZING_TAAL', `${veld}.uk — українською`, `${veld}.uk in het Oekraïens`);
    else if (RUSSISCH.test(v.uk)) f('VERWIJZING_TAAL', `${veld}.uk містить літери, яких немає в українській абетці`, `${veld}.uk bevat letters die niet Oekraïens zijn`);
  }
  return z;
}

/** Новий запис реєстру з параметрів командного рядка. */
export function maakGebeurtenis(o) {
  const soort = o.soort; const id = soort === 'pr' ? Number(String(o.id ?? '').replace(/^[#№]/, '')) : String(o.id ?? '').trim();
  const tijd = o.tijd ? new Date(o.tijd).toISOString() : new Date().toISOString();
  const r = {
    schema: 1, soort, id, gebeurtenis: o.gebeurtenis, tijd,
    wie: { naam: String(o.wie ?? '').trim(), ...(o.agent ? { agent: o.agent } : {}), ...(o.model ? { model: o.model } : {}) },
    ...(o.waaromUk ? { waarom: { uk: o.waaromUk, ...(o.waaromNl ? { nl: o.waaromNl } : {}) } } : {}),
    ...(o.titelUk ? { titel: { uk: o.titelUk, ...(o.titelNl ? { nl: o.titelNl } : {}) } } : {}),
    ...(o.samenvattingUk ? { samenvatting: { uk: o.samenvattingUk, ...(o.samenvattingNl ? { nl: o.samenvattingNl } : {}) } } : {}),
    ...(o.laatsteCommit ? { laatsteCommit: o.laatsteCommit } : {}),
    ...(o.opgenomenIn ? { opgenomenIn: String(o.opgenomenIn).trim() } : {}),
    ...(o.taken?.length ? { taken: o.taken } : {}),
  };
  const stempel = tijd.replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const pad = `${VERWIJZINGEN_MAP}/${soort}-${slugVoor(id)}/${stempel}-${o.gebeurtenis}.json`;
  return { gebeurtenis: r, pad, zaken: valideerGebeurtenis(r, { pad }) };
}

/** Останній стан і опис для кожної гілки чи запиту з реєстру. */
export function registerSamenvatten(records) {
  const uit = new Map();
  for (const r of [...records].filter(Boolean).sort((a, b) => String(a.tijd).localeCompare(String(b.tijd)))) {
    const k = sleutel(r.soort, r.id); const cur = uit.get(k) ?? { taken: new Set() };
    if (r.gebeurtenis === 'beschrijving' || r.titel) { if (r.titel) cur.titel = r.titel; if (r.samenvatting) cur.samenvatting = r.samenvatting; }
    if (r.gebeurtenis !== 'beschrijving') cur.gebeurtenis = r; // новіша подія перекриває старішу
    for (const t of r.taken ?? []) cur.taken.add(t);
    uit.set(k, cur);
  }
  return uit;
}

const PR_IN_TEKST = (n) => new RegExp(`(?:#|№)${n}(?![0-9])`);
const TAKEN_IN = (t) => [...new Set(String(t).match(/\b[A-Z][A-Z0-9]{1,9}-\d{3,5}\b/g) ?? [])];

/** Знайти, де запит на злиття ввійшов в історію: коміт злиття GitHub, наш «Злиття #N» або стиснутий «(#N)». */
function vindPrSamenvoeging(commits, n) {
  const re = PR_IN_TEKST(n);
  return commits.find((c) => c.merge && re.test(c.onderwerp)) ?? commits.find((c) => !c.merge && new RegExp(`\\((?:#|№)${n}\\)\\s*$`).test(c.onderwerp)) ?? null;
}
/** Опис запиту з повідомлення злиття GitHub («Merge pull request #N from x/y» + назва в тілі). */
function prTitelUit(c) {
  if (!c) return null;
  const regels = c.tekst.split('\n').map((x) => x.trim()).filter((x) => x && !/^(Co-Authored-By|Claude-Session|Signed-off-by):/i.test(x));
  if (/^Merge pull request #/.test(regels[0] ?? '')) return { titel: regels[1] ?? null, samenvatting: regels.slice(2).join(' ') || null };
  // «Злиття #160 (BIJDRAGE-001, облік авторства) у …» → «облік авторства»; без змістовних слів у дужках — перше речення тіла.
  const binnen = (regels[0]?.match(/\(([^)]+)\)/)?.[1] ?? '').split(',').map((x) => x.trim()).filter((x) => !TAAK_RE.test(x) && !SHA_RE.test(x)).join(', ');
  const lijf = regels.slice(1).join(' ');
  const titel = (binnen.match(/[\u0400-\u04FF]/g) ?? []).length >= 6 ? binnen.charAt(0).toUpperCase() + binnen.slice(1) : null;
  return { titel, samenvatting: lijf || null };
}

/**
 * Зібрати посилання для випуску. Повертає { verwijzingen, zaken }.
 * o: { git, head, basis, bijdragen, taken: Map<id,obj>, register: records[], doelTak, migratieMap='migrations' }
 */
export function bouwVerwijzingen(o) {
  const { git, head } = o; const zaken = []; const uit = new Map();
  const reg = registerSamenvatten(o.register ?? []);
  const commits = (git('log', '--format=%H%x1f%P%x1f%cI%x1f%B%x1e', '--max-count=5000', head) || '').split('\x1e').map((x) => x.trim()).filter(Boolean).map((r) => {
    const [sha, ouders, tijd, tekst = ''] = r.split('\x1f');
    return { sha, ouders: ouders.split(' ').filter(Boolean), merge: ouders.split(' ').filter(Boolean).length > 1, tijd, tekst, onderwerp: tekst.split('\n')[0] ?? '' };
  });
  const doel = o.doelTak || null;
  const voeg = (v, taak) => {
    const k = sleutel(v.soort, v.id); const cur = uit.get(k);
    if (cur) { if (taak && !cur.taken.includes(taak)) cur.taken.push(taak); return cur; }
    const n = { ...v, taken: taak ? [taak] : [] }; uit.set(k, n); return n;
  };
  const bijdragenPerTak = new Map(); const bijdragenPerPr = new Map();
  for (const b of o.bijdragen ?? []) { if (b?.tak) bijdragenPerTak.set(b.tak, b); if (b?.pr) bijdragenPerPr.set(Number(b.pr), b); }

  // Задачі
  for (const taakId of new Set((o.bijdragen ?? []).map((b) => b?.taakId).filter(Boolean))) {
    const t = o.taken?.get(taakId); const b = (o.bijdragen ?? []).find((x) => x.taakId === taakId);
    const bron = t?.omschrijving || b?.wat?.uk || taakId; const kortT = korteTitel(bron);
    voeg({ soort: 'taak', id: taakId, label: taakId, titel: { uk: kortT }, ...(bron.length > kortT.length ? { samenvatting: { uk: kort(bron, 300) } } : {}), pad: t ? `orchestratie/taken/${taakId}.json` : null, bron: head }, taakId);
  }

  // Запити на злиття
  const prs = new Set([...(o.bijdragen ?? []).map((b) => b?.pr).filter((x) => Number.isInteger(x) && x > 0), ...[...reg.keys()].filter((k) => k.startsWith('pr:')).map((k) => Number(k.slice(3)))]);
  for (const n of prs) {
    const r = reg.get(sleutel('pr', n)); const b = bijdragenPerPr.get(n); const c = vindPrSamenvoeging(commits, n); const uitC = prTitelUit(c);
    const titel = r?.titel ?? (uitC?.titel ? { uk: korteTitel(uitC.titel) } : b ? { uk: korteTitel(b.wat?.uk) } : uitC?.samenvatting ? { uk: korteTitel(uitC.samenvatting) } : { uk: `Запит на злиття №${n}` });
    const samenvatting = r?.samenvatting ?? (b?.wat?.uk ? { uk: kort(b.wat.uk, 300) } : uitC?.samenvatting ? { uk: kort(uitC.samenvatting, 300) } : null);
    const g = r?.gebeurtenis;
    let staat = 'open'; const extra = {};
    if (g && ['gesloten', 'verwijderd'].includes(g.gebeurtenis)) { staat = 'gesloten'; Object.assign(extra, gebeurtenisVelden(g)); }
    else if (c) { staat = 'samengevoegd'; Object.assign(extra, { tijd: c.tijd, commit: c.sha, ...(c.merge ? { laatsteCommit: c.ouders[1] } : {}), ...(doel ? { in: doel } : {}) }); }
    else if (g?.gebeurtenis === 'samengevoegd') { staat = 'samengevoegd'; Object.assign(extra, gebeurtenisVelden(g)); }
    const v = voeg({ soort: 'pr', id: n, label: `№${n}`, titel: tekstVeld(titel, 110), ...(samenvatting ? { samenvatting: tekstVeld(samenvatting, 300) } : {}), staat, ...extra, ...(b?.tak ? { tak: b.tak } : {}) }, b?.taakId);
    for (const t of r?.taken ?? []) if (!v.taken.includes(t)) v.taken.push(t);
  }

  // Гілки
  const takken = new Set([...(o.bijdragen ?? []).map((b) => b?.tak).filter(Boolean), ...[...reg.keys()].filter((k) => k.startsWith('tak:')).map((k) => k.slice(4))]);
  for (const tak of takken) {
    if (!TAK_RE.test(tak)) continue;
    const r = reg.get(sleutel('tak', tak)); const b = bijdragenPerTak.get(tak); const g = r?.gebeurtenis;
    const tip = git('rev-parse', '--verify', '-q', `refs/remotes/origin/${tak}^{commit}`) || git('rev-parse', '--verify', '-q', `refs/heads/${tak}^{commit}`);
    const titel = r?.titel ?? (b ? { uk: korteTitel(b.wat?.uk) } : { uk: tak });
    let staat; const extra = {};
    if (tip) {
      const binnen = git('merge-base', '--is-ancestor', tip, head) !== null;
      if (binnen) {
        const m = git('log', '--merges', '--ancestry-path', '--reverse', '--format=%H%x1f%cI', `${tip}..${head}`)?.split('\n').filter(Boolean)[0]?.split('\x1f');
        staat = 'samengevoegd'; Object.assign(extra, { laatsteCommit: tip, ...(m ? { commit: m[0], tijd: m[1] } : {}), ...(doel ? { in: doel } : {}) });
      } else { staat = 'open'; Object.assign(extra, { laatsteCommit: tip, bestaat: true }); }
      if (binnen) extra.bestaat = true;
    } else if (g && g.gebeurtenis === 'verwijderd') { staat = 'verwijderd'; Object.assign(extra, gebeurtenisVelden(g)); }
    else {
      // Гілку видалено після злиття (звичайна річ на GitHub): шукаємо коміт злиття з її назвою.
      const esc = tak.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const c = commits.find((x) => x.merge && new RegExp(`(?:from [^\\s/]+/${esc}|'${esc}')(?:\\s|$)`).test(x.onderwerp));
      if (c) { staat = 'samengevoegd'; Object.assign(extra, { commit: c.sha, tijd: c.tijd, laatsteCommit: c.ouders[1], ...(doel ? { in: doel } : {}), takWeg: true }); }
      else if (g && ['gesloten', 'samengevoegd'].includes(g.gebeurtenis)) { staat = g.gebeurtenis; Object.assign(extra, gebeurtenisVelden(g)); }
      else {
        staat = 'onbekend';
        const laatste = (o.bijdragen ?? []).filter((x) => x.tak === tak).flatMap((x) => x.commits ?? []).find((s) => SHA_RE.test(s));
        if (laatste) extra.laatsteCommit = laatste;
        zaken.push(waarsch('VERWIJZING_ONVERKLAARD', `гілки «${tak}» немає ні в сховищі, ні в історії злиттів, і запису про її видалення теж немає — додайте його: node scripts/orch.mjs verwijzing --soort tak --id ${tak} --gebeurtenis verwijderd --wie "…" --waarom "…" --laatste-commit <sha>`, `tak «${tak}» ontbreekt zonder registratie van verwijdering`));
      }
    }
    const samenv = r?.samenvatting ?? (b?.wat?.uk && b.wat.uk.length > (titel.uk ?? '').length ? { uk: kort(b.wat.uk, 300) } : null);
    // Номер запиту з коміту злиття гілки («Злиття #160 …», «Merge pull request #160 from …»)
    const viaPr = extra.commit ? Number(commits.find((x) => x.sha === extra.commit)?.onderwerp.match(/(?:#|№)(\d+)/)?.[1] ?? 0) : 0;
    if (viaPr) extra.pr = viaPr;
    const v = voeg({ soort: 'tak', id: tak, label: tak, titel: tekstVeld(titel, 110), ...(samenv ? { samenvatting: tekstVeld(samenv, 300) } : {}), staat, ...extra }, b?.taakId);
    for (const t of r?.taken ?? []) if (!v.taken.includes(t)) v.taken.push(t);
  }

  // Запити на злиття, відомі лише з коміту злиття гілки: окреме посилання з тією самою задачею.
  for (const v of [...uit.values()].filter((x) => x.soort === 'tak' && x.pr && !uit.has(sleutel('pr', x.pr)))) {
    const c = commits.find((x) => x.sha === v.commit); const uitC = prTitelUit(c);
    const pv = voeg({ soort: 'pr', id: v.pr, label: `№${v.pr}`, titel: uitC?.titel ? { uk: korteTitel(uitC.titel) } : v.titel, ...(v.samenvatting ? { samenvatting: v.samenvatting } : {}), staat: 'samengevoegd', tijd: v.tijd, commit: v.commit, laatsteCommit: v.laatsteCommit, ...(v.in ? { in: v.in } : {}), tak: v.id }, null);
    for (const t of v.taken) if (!pv.taken.includes(t)) pv.taken.push(t);
  }

  // Міграції, додані у випуску
  const map = o.migratieMap ?? 'migrations';
  if (o.basis) {
    for (const pad of (git('diff', '--name-only', '--diff-filter=A', `${o.basis}..${head}`, '--', map) || '').split('\n').filter((p) => /\/\d{4}_[^/]+\.sql$/.test(p))) {
      const nummer = pad.match(/\/(\d{4})_/)[1];
      const kop = (git('show', `${head}:${pad}`) || '').split('\n').filter((l) => l.startsWith('--')).map((l) => l.replace(/^--\s?/, '').trim()).filter(Boolean);
      const eerste = (kop[0] ?? '').replace(new RegExp(`^${nummer}\\s*[:—–-]\\s*`), '');
      const add = git('log', '--diff-filter=A', '--format=%H%x1f%cI%x1f%B', '-1', head, '--', pad)?.split('\x1f') ?? [];
      const taken = [...new Set([...TAKEN_IN(eerste), ...TAKEN_IN(add[2] ?? '')])].filter((t) => o.taken?.has(t) || (o.bijdragen ?? []).some((b) => b.taakId === t));
      const naam = pad.split('/').pop().replace(/^\d{4}_|\.sql$/g, '').replace(/_/g, ' ');
      const v = { soort: 'migratie', id: nummer, label: nummer, titel: { uk: /[\u0400-\u04FF]/.test(eerste) ? korteTitel(eerste.charAt(0).toUpperCase() + eerste.slice(1)) : `Зміна бази даних: ${naam}` }, ...(kop.length > 1 || eerste.length > 90 ? { samenvatting: { uk: kort(kop.join(' ').replace(new RegExp(`^${nummer}\\s*[:—–-]\\s*`), ''), 300) } } : {}), pad, bron: head, ...(add[0] ? { commit: add[0], tijd: add[1] } : {}) };
      if (!taken.length) voeg(v, null); else for (const t of taken) voeg(v, t);
    }
  }
  return { verwijzingen: [...uit.values()], zaken };
}

function gebeurtenisVelden(g) {
  return {
    tijd: g.tijd, wie: g.wie?.naam, ...(g.waarom ? { waarom: g.waarom } : {}),
    ...(g.laatsteCommit ? { laatsteCommit: g.laatsteCommit } : {}), ...(g.opgenomenIn ? { opgenomenIn: g.opgenomenIn } : {}),
  };
}

/** Стиснути для UITROL-MANIFEST.json (обмеження розміру): найважливіші поля, не більше MANIFEST_VERWIJZINGEN_MAX. */
export function manifestVerwijzingen(lijst, { zonderSamenvatting = false } = {}) {
  return lijst.slice(0, MANIFEST_VERWIJZINGEN_MAX).map((v) => {
    const { bestaat, takWeg, ...r } = v;
    const uit = { ...r, ...(bestaat ? { bestaat: true } : {}), ...(takWeg ? { takWeg: true } : {}) };
    if (zonderSamenvatting) delete uit.samenvatting;
    for (const k of Object.keys(uit)) if (uit[k] === null || uit[k] === undefined) delete uit[k];
    return uit;
  });
}
