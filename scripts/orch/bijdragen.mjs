// BIJDRAGE-001 · Облік авторства, тематичні досьє й злиття без втрати можливостей.
// BIJDRAGE-001 · Auteurschap per bijdrage, onderwerpdossiers en samenvoegen zonder verlies van mogelijkheden.
//
// Три сховища, усі в git і всі лише доповнюються:
//   orchestratie/bijdragen/<TAAK-ID>/<РРРРММДД-ГГХХСС>-<виконавець>.json — хто (людина, агент, модель), що, чому, на чому будує.
//     Один файл на одну подію, тож паралельні гілки ніколи не конфліктують, а злиття (--no-ff) нічого не губить.
//     Запис не редагують і не видаляють: виправлення — новий запис «correctie» із посиланням на попередній.
//   orchestratie/onderwerpen/<назва>.json — досьє функції (наприклад «meldingen»): усі задачі, гілки, запити на злиття,
//     можливості з походженням і станом, зауваження власника (що саме не подобається і що лишається), відкриті питання.
//   scripts/vaardigheden/catalogus.json — навички; кожна можливість навички має незмінний id.
// Перевірка «behoud» порівнює HEAD із базою: зниклий запис, зникла навичка чи можливість без пояснення — помилка.
// Тут лише чисті функції (без git і файлової системи); їх викликають scripts/orch.mjs і тести.
// Alleen pure functies; git en bestanden zitten in scripts/orch.mjs.

const fout = (code, uk, nl) => ({ code, ernst: 'fout', uk, nl });
const waarsch = (code, uk, nl) => ({ code, ernst: 'waarschuwing', uk, nl });

export const BIJDRAGEN_MAP = 'orchestratie/bijdragen';
export const ONDERWERPEN_MAP = 'orchestratie/onderwerpen';
export const TAAK_ID = /^[A-Z][A-Z0-9]{1,9}-\d{3,5}$/;
export const STEMPEL = /^\d{8}-\d{6}$/;
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA = /^[0-9a-f]{7,40}$/;
const CYRILLISCH = /[Ѐ-ӿ]/;
// Літери, яких немає в українській абетці (мовний закон проєкту).
const RU_LETTERS = /[ЁёЪъЫыЭэ]/;
/** «Claude», «Gemini», «GPT» — це родини чи платформи, а не модель. Потрібна конкретна модель (claude-opus-5-5, Gemini 4 Hydrogen (high)…). */
export const ALLEEN_FAMILIE = /^(claude|grok|gpt|gemini|cursor|copilot|codex|chatgpt|antigravity|autoclaw|openclaw|zhipu|glm|llama|mistral|ai|llm|ші|onbekend|unknown|невідомо|модель)$/i;
export const GENERIEKE_MENS = /^(власник|eigenaar|owner|admin|administrator|адміністратор|user|користувач|gebruiker|автор|auteur|author|невідомо|onbekend|unknown)$/i;

/** Вид внеску. Soort bijdrage. */
export const SOORTEN = {
  begin: { uk: 'розпочав роботу', nl: 'begon het werk' },
  nieuw: { uk: 'створив нове', nl: 'maakte nieuw werk' },
  herwerkt: { uk: 'переробив попереднє', nl: 'werkte eerder werk om' },
  afgerond: { uk: 'доробив розпочате', nl: 'maakte begonnen werk af' },
  overname: { uk: 'перейняв роботу іншого', nl: 'nam werk van een ander over' },
  samenvoeging: { uk: 'об’єднав гілки чи напрацювання', nl: 'voegde takken of werk samen' },
  herstel: { uk: 'повернув утрачене', nl: 'herstelde verloren werk' },
  controle: { uk: 'перевірив', nl: 'controleerde' },
  correctie: { uk: 'виправив попередній запис обліку', nl: 'corrigeerde een eerdere registratie' },
};
/** Ці види змінюють чужу або попередню роботу — тому обов'язкові «чому» і «на чому будує». */
export const VIMAGAYUT_POPEREDNYKA = ['herwerkt', 'afgerond', 'overname', 'herstel', 'correctie', 'samenvoeging'];
export const MODEL_BRONNEN = ['omgeving', 'auteur', 'eigenaar'];

const tekst = (x, max = 2000) => (typeof x === 'string' ? x.replace(/\0/g, '').trim().slice(0, max) : '');
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

export const bijdrageId = (taakId, stempel, wie) => `${taakId}/${stempel}-${wie}`;
export const bijdragePad = (taakId, stempel, wie) => `${BIJDRAGEN_MAP}/${taakId}/${stempel}-${wie}.json`;
export const stempelVan = (iso) => String(iso).replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

/** Ярлик виконавця для назви файла: агент (claude) або латинська назва людини. */
export function wieSlug(uitvoerder) {
  if (uitvoerder?.soort === 'ai') return String(uitvoerder.agent || '').toLowerCase();
  const s = String(uitvoerder?.naam || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return s ? `mens-${s}` : 'mens';
}

function tweetalig(o, veld, min, z, p, verplicht = true) {
  const uk = tekst(o?.[veld]?.uk); const nl = tekst(o?.[veld]?.nl);
  if (!uk) { if (verplicht) z.push(fout('BIJDRAGE_VELD', `${p}: ${veld}.uk — обов'язково (≥ ${min} символів)`, `${p}: ${veld}.uk is verplicht (≥ ${min} tekens)`)); return; }
  if (uk.length < min) z.push(fout('BIJDRAGE_VELD', `${p}: ${veld}.uk закороткий (≥ ${min} символів)`, `${p}: ${veld}.uk te kort (≥ ${min} tekens)`));
  if (!CYRILLISCH.test(uk)) z.push(fout('BIJDRAGE_TAAL', `${p}: ${veld}.uk має бути українською`, `${p}: ${veld}.uk moet Oekraïens zijn`));
  if (RU_LETTERS.test(uk)) z.push(fout('BIJDRAGE_TAAL', `${p}: ${veld}.uk містить літери поза українською абеткою`, `${p}: ${veld}.uk bevat letters buiten het Oekraïense alfabet`));
  if (nl && CYRILLISCH.test(nl)) z.push(fout('BIJDRAGE_TAAL', `${p}: ${veld}.nl має бути нідерландською`, `${p}: ${veld}.nl moet Nederlands zijn`));
}

/** Перевірка одного запису внеску. `bekendeIds` — ідентифікатори всіх записів (для посилань «будує на»). */
export function valideerBijdrage(b, { pad, bekendeIds } = {}) {
  const z = []; const p = pad || b?.id || 'bijdrage';
  if (!isObj(b)) return [fout('BIJDRAGE_ONGELDIG', `${p}: очікується JSON-об'єкт`, `${p}: JSON-object verwacht`)];
  if (b.schema !== 1) z.push(fout('BIJDRAGE_SCHEMA', `${p}: schema має бути 1`, `${p}: schema moet 1 zijn`));
  if (!TAAK_ID.test(String(b.taakId || ''))) z.push(fout('BIJDRAGE_TAAK', `${p}: taakId у форматі ABC-001`, `${p}: taakId in de vorm ABC-001`));
  if (!b.tijd || Number.isNaN(Date.parse(b.tijd))) z.push(fout('BIJDRAGE_TIJD', `${p}: tijd — дата й час ISO 8601`, `${p}: tijd — ISO 8601`));
  const u = b.uitvoerder;
  if (!isObj(u) || !['ai', 'mens'].includes(u.soort)) z.push(fout('BIJDRAGE_UITVOERDER', `${p}: uitvoerder.soort — «ai» або «mens»`, `${p}: uitvoerder.soort — «ai» of «mens»`));
  else if (u.soort === 'ai') {
    if (!/^[a-z][a-z0-9-]{1,30}$/.test(String(u.agent || ''))) z.push(fout('BIJDRAGE_AGENT', `${p}: uitvoerder.agent — ідентифікатор агента з beleid.json (claude, gemini…)`, `${p}: uitvoerder.agent — agent-id uit beleid.json`));
    if (!tekst(u.platform, 80)) z.push(fout('BIJDRAGE_PLATFORM', `${p}: uitvoerder.platform — де працював агент (Claude Code, Google Antigravity…)`, `${p}: uitvoerder.platform is verplicht`));
    const mid = tekst(u.model?.id, 120);
    if (!mid || ALLEEN_FAMILIE.test(mid)) z.push(fout('BIJDRAGE_MODEL', `${p}: uitvoerder.model.id — конкретна модель (напр. claude-opus-5-5, «Gemini 4 Hydrogen (high)»), не лише назва родини`, `${p}: uitvoerder.model.id — een concreet model, niet alleen de familienaam`));
    if (!MODEL_BRONNEN.includes(u.model?.bron)) z.push(fout('BIJDRAGE_MODEL_BRON', `${p}: uitvoerder.model.bron — ${MODEL_BRONNEN.join(' | ')} (хто підтвердив модель)`, `${p}: uitvoerder.model.bron — ${MODEL_BRONNEN.join(' | ')}`));
  } else {
    const naam = tekst(u.naam, 120);
    if (naam.length < 2 || GENERIEKE_MENS.test(naam)) z.push(fout('BIJDRAGE_MENS', `${p}: uitvoerder.naam — справжнє ім'я людини, не «Власник»`, `${p}: uitvoerder.naam — echte naam, geen alias`));
  }
  const opdr = b.opdrachtgever;
  if (!isObj(opdr) || tekst(opdr.naam, 120).length < 2 || GENERIEKE_MENS.test(tekst(opdr.naam, 120))) z.push(fout('BIJDRAGE_OPDRACHTGEVER', `${p}: opdrachtgever.naam — людина, яка доручила чи вела роботу (справжнє ім'я)`, `${p}: opdrachtgever.naam — de persoon die het werk gaf of stuurde`));
  if (!SOORTEN[b.soort]) z.push(fout('BIJDRAGE_SOORT', `${p}: soort — одне з ${Object.keys(SOORTEN).join(', ')}`, `${p}: soort — een van ${Object.keys(SOORTEN).join(', ')}`));
  tweetalig(b, 'wat', 20, z, p);
  const potribenPoperednyk = VIMAGAYUT_POPEREDNYKA.includes(b.soort);
  tweetalig(b, 'waarom', 10, z, p, potribenPoperednyk);
  const op = Array.isArray(b.bouwtVoortOp) ? b.bouwtVoortOp : [];
  if (b.bouwtVoortOp !== undefined && !Array.isArray(b.bouwtVoortOp)) z.push(fout('BIJDRAGE_VOORGANGER', `${p}: bouwtVoortOp — список`, `${p}: bouwtVoortOp — lijst`));
  for (const [i, v] of op.entries()) {
    if (typeof v === 'string') {
      if (bekendeIds && !bekendeIds.has(v)) z.push(fout('BIJDRAGE_VOORGANGER_ONBEKEND', `${p}: bouwtVoortOp[${i}] «${v}» — такого запису немає в ${BIJDRAGEN_MAP}`, `${p}: bouwtVoortOp[${i}] «${v}» bestaat niet`));
    } else if (!isObj(v) || tekst(v.beschrijving).length < 10 || (v.commit && !SHA.test(v.commit))) {
      z.push(fout('BIJDRAGE_VOORGANGER', `${p}: bouwtVoortOp[${i}] — ідентифікатор запису або { beschrijving (≥ 10), tak?, commit?, pr? } для роботи без запису`, `${p}: bouwtVoortOp[${i}] — id of { beschrijving, tak?, commit?, pr? }`));
    }
  }
  if (potribenPoperednyk && !op.length) z.push(fout('BIJDRAGE_VOORGANGER', `${p}: для «${b.soort}» обов'язково bouwtVoortOp — чию роботу продовжено чи перероблено`, `${p}: bij «${b.soort}» is bouwtVoortOp verplicht — wiens werk wordt voortgezet of omgewerkt`));
  if (b.tak !== undefined && !tekst(b.tak, 200)) z.push(fout('BIJDRAGE_TAK', `${p}: tak — назва гілки`, `${p}: tak — naam van de tak`));
  if (b.pr !== undefined && b.pr !== null && !(Number.isInteger(b.pr) && b.pr > 0)) z.push(fout('BIJDRAGE_PR', `${p}: pr — номер запиту на злиття або null`, `${p}: pr — nummer of null`));
  if (b.commits !== undefined && (!Array.isArray(b.commits) || !b.commits.every((c) => SHA.test(String(c))))) z.push(fout('BIJDRAGE_COMMITS', `${p}: commits — список SHA`, `${p}: commits — lijst met SHA's`));
  if (b.onderwerpen !== undefined && (!Array.isArray(b.onderwerpen) || !b.onderwerpen.every((o) => SLUG.test(String(o))))) z.push(fout('BIJDRAGE_ONDERWERP', `${p}: onderwerpen — назви досьє (meldingen, vaardigheden…)`, `${p}: onderwerpen — namen van dossiers`));
  if (pad && b.taakId && !pad.startsWith(`${BIJDRAGEN_MAP}/${b.taakId}/`)) z.push(fout('BIJDRAGE_PAD', `${p}: файл має лежати в ${BIJDRAGEN_MAP}/${b.taakId}/`, `${p}: bestand hoort in ${BIJDRAGEN_MAP}/${b.taakId}/`));
  if (pad && b.id && pad !== `${BIJDRAGEN_MAP}/${b.id}.json`) z.push(fout('BIJDRAGE_ID', `${p}: id «${b.id}» не відповідає шляху файла`, `${p}: id «${b.id}» past niet bij het pad`));
  return z;
}

/** Будує новий запис (CLI `orch bijdrage`). Повертає { bijdrage, pad, zaken }. */
export function maakBijdrage(o) {
  const tijd = o.tijd ?? new Date().toISOString();
  const uitvoerder = o.agent
    ? { soort: 'ai', agent: o.agent, platform: o.platform ?? '', ...(o.tool ? { tool: o.tool } : {}), model: { id: o.modelId ?? '', bron: o.modelBron ?? 'omgeving' } }
    : { soort: 'mens', naam: o.mens ?? '' };
  const stempel = stempelVan(tijd); const wie = wieSlug(uitvoerder);
  const b = {
    schema: 1, id: bijdrageId(o.taakId, stempel, wie), taakId: o.taakId, tijd, ...(o.vastgelegd ? { vastgelegd: o.vastgelegd } : {}), uitvoerder,
    opdrachtgever: { naam: o.opdrachtgever ?? '' }, soort: o.soort,
    wat: { uk: o.watUk ?? '', ...(o.watNl ? { nl: o.watNl } : {}) },
    ...(o.waaromUk ? { waarom: { uk: o.waaromUk, ...(o.waaromNl ? { nl: o.waaromNl } : {}) } } : {}),
    ...(o.bouwtVoortOp?.length ? { bouwtVoortOp: o.bouwtVoortOp } : {}),
    ...(o.tak ? { tak: o.tak } : {}), pr: o.pr ?? null,
    ...(o.commits?.length ? { commits: o.commits } : {}),
    ...(o.onderwerpen?.length ? { onderwerpen: o.onderwerpen } : {}),
    ...(o.parallel?.length ? { parallel: o.parallel } : {}),
  };
  const pad = bijdragePad(o.taakId, stempel, wie);
  return { bijdrage: b, pad, zaken: valideerBijdrage(b, { pad, bekendeIds: o.bekendeIds }) };
}

/** Перевірка досьє функції orchestratie/onderwerpen/<naam>.json. */
export const MOGELIJKHEID_STATEN = ['actief', 'in-ontwikkeling', 'verloren', 'vervangen', 'ingetrokken'];
export function valideerOnderwerp(d, { pad } = {}) {
  const z = []; const p = pad || d?.naam || 'onderwerp';
  if (!isObj(d)) return [fout('ONDERWERP_ONGELDIG', `${p}: очікується JSON-об'єкт`, `${p}: JSON-object verwacht`)];
  if (d.schema !== 1) z.push(fout('ONDERWERP_SCHEMA', `${p}: schema має бути 1`, `${p}: schema moet 1 zijn`));
  if (!SLUG.test(String(d.naam || ''))) z.push(fout('ONDERWERP_NAAM', `${p}: naam — латиниця з дефісами`, `${p}: naam — kleine letters met koppeltekens`));
  if (pad && d.naam && pad !== `${ONDERWERPEN_MAP}/${d.naam}.json`) z.push(fout('ONDERWERP_PAD', `${p}: файл має називатися ${d.naam}.json`, `${p}: bestand moet ${d.naam}.json heten`));
  for (const t of ['uk', 'nl']) if (tekst(d.titel?.[t]).length < 3) z.push(fout('ONDERWERP_TITEL', `${p}: titel.${t}`, `${p}: titel.${t}`));
  if (tekst(d.samenvatting?.uk).length < 20 || !CYRILLISCH.test(tekst(d.samenvatting?.uk))) z.push(fout('ONDERWERP_SAMENVATTING', `${p}: samenvatting.uk українською (≥ 20 символів)`, `${p}: samenvatting.uk in het Oekraïens`));
  if (!Array.isArray(d.paden) || !d.paden.length || !d.paden.every((x) => typeof x === 'string' && x && !x.startsWith('/') && !x.includes('..'))) z.push(fout('ONDERWERP_PADEN', `${p}: paden — відносні шляхи чи префікси файлів функції`, `${p}: paden — relatieve paden of voorvoegsels`));
  if (!Array.isArray(d.termen?.uk) || !Array.isArray(d.termen?.nl)) z.push(fout('ONDERWERP_TERMEN', `${p}: termen.uk і termen.nl — списки слів для пошуку`, `${p}: termen.uk en termen.nl — lijsten`));
  if (!Array.isArray(d.werk)) z.push(fout('ONDERWERP_WERK', `${p}: werk — список задач, гілок і запитів на злиття`, `${p}: werk — lijst taken/takken/PR's`));
  else d.werk.forEach((w, i) => {
    if (!isObj(w) || (!TAAK_ID.test(String(w.taakId || '')) && !tekst(w.tak))) z.push(fout('ONDERWERP_WERK', `${p}: werk[${i}] — taakId або tak`, `${p}: werk[${i}] — taakId of tak`));
    if (w && tekst(w.uk).length < 10) z.push(fout('ONDERWERP_WERK', `${p}: werk[${i}].uk — що зроблено (≥ 10)`, `${p}: werk[${i}].uk — wat er gedaan is`));
  });
  const ids = new Set();
  if (!Array.isArray(d.mogelijkheden)) z.push(fout('ONDERWERP_MOGELIJKHEDEN', `${p}: mogelijkheden — список можливостей функції`, `${p}: mogelijkheden — lijst`));
  else d.mogelijkheden.forEach((m, i) => {
    const q = `${p}: mogelijkheden[${i}]`;
    if (!isObj(m) || !SLUG.test(String(m.id || ''))) { z.push(fout('MOGELIJKHEID_ID', `${q}.id — незмінний ідентифікатор (латиниця з дефісами)`, `${q}.id — vaste id`)); return; }
    if (ids.has(m.id)) z.push(fout('MOGELIJKHEID_DUBBEL', `${q}: id «${m.id}» повторюється`, `${q}: id «${m.id}» dubbel`));
    ids.add(m.id);
    if (tekst(m.uk).length < 10) z.push(fout('MOGELIJKHEID_TEKST', `${q}.uk — опис (≥ 10)`, `${q}.uk — omschrijving`));
    if (!MOGELIJKHEID_STATEN.includes(m.staat)) z.push(fout('MOGELIJKHEID_STAAT', `${q}.staat — ${MOGELIJKHEID_STATEN.join(' | ')}`, `${q}.staat — ${MOGELIJKHEID_STATEN.join(' | ')}`));
    if (['verloren', 'vervangen', 'ingetrokken'].includes(m.staat) && tekst(m.reden).length < 10) z.push(fout('MOGELIJKHEID_REDEN', `${q}: стан «${m.staat}» потребує reden — чому і де шукати`, `${q}: staat «${m.staat}» vraagt een reden`));
    if (m.staat === 'vervangen' && !m.vervangenDoor) z.push(fout('MOGELIJKHEID_VERVANGEN', `${q}: «vervangen» потребує vervangenDoor — id можливості, що її замінила`, `${q}: «vervangen» vraagt vervangenDoor`));
    if (m.staat === 'ingetrokken' && tekst(m.besluit).length < 5) z.push(fout('MOGELIJKHEID_BESLUIT', `${q}: «ingetrokken» лише за рішенням власника — поле besluit (дата, слова власника)`, `${q}: «ingetrokken» alleen met besluit van de eigenaar`));
  });
  for (const m of d.mogelijkheden ?? []) if (m?.vervangenDoor && !ids.has(m.vervangenDoor)) z.push(fout('MOGELIJKHEID_VERVANGEN', `${p}: vervangenDoor «${m.vervangenDoor}» не знайдено серед можливостей`, `${p}: vervangenDoor «${m.vervangenDoor}» onbekend`));
  if (!Array.isArray(d.opmerkingenEigenaar)) z.push(fout('ONDERWERP_OPMERKINGEN', `${p}: opmerkingenEigenaar — список (може бути порожній)`, `${p}: opmerkingenEigenaar — lijst`));
  else d.opmerkingenEigenaar.forEach((o, i) => {
    const q = `${p}: opmerkingenEigenaar[${i}]`;
    if (!isObj(o) || tekst(o.betreft).length < 3) z.push(fout('OPMERKING_BETREFT', `${q}.betreft — яка саме річ (кнопка, вигляд, поведінка), не «уся функція»`, `${q}.betreft — welk concreet onderdeel`));
    if (o && tekst(o.uk).length < 10) z.push(fout('OPMERKING_TEKST', `${q}.uk — що саме не так, словами власника або близько до них`, `${q}.uk — wat er precies mis is`));
    if (o && !Array.isArray(o.behouden)) z.push(fout('OPMERKING_BEHOUDEN', `${q}.behouden — що лишається без змін (зауваження стосується лише однієї речі)`, `${q}.behouden — wat blijft zoals het is`));
  });
  return z;
}

/**
 * Злиття без втрати (порівняння бази з HEAD). Повертає зауваги.
 * oud/nieuw: { bijdragen: Map<pad, tekst>, onderwerpen: Map<naam, obj>, catalogus: obj|null }
 */
const normTekst = (t) => String(t ?? '').replace(/\r\n/g, '\n').trim();
export function behoudVergelijk(oud, nieuw) {
  const z = [];
  for (const [pad, t] of oud.bijdragen ?? new Map()) {
    if (!nieuw.bijdragen?.has(pad)) z.push(fout('BIJDRAGE_VERWIJDERD', `запис обліку ${pad} зник — облік лише доповнюється; поверніть файл (git checkout <база> -- ${pad})`, `registratie ${pad} is verdwenen — terugzetten`));
    else if (normTekst(nieuw.bijdragen.get(pad)) !== normTekst(t)) z.push(fout('BIJDRAGE_GEWIJZIGD', `запис обліку ${pad} змінено — його не редагують; додайте новий запис «correctie» з bouwtVoortOp`, `registratie ${pad} is gewijzigd — voeg een «correctie» toe in plaats van te bewerken`));
  }
  for (const [naam, d] of oud.onderwerpen ?? new Map()) {
    const n = nieuw.onderwerpen?.get(naam);
    if (!n) { z.push(fout('ONDERWERP_VERWIJDERD', `досьє ${ONDERWERPEN_MAP}/${naam}.json зникло — досьє не видаляють`, `dossier ${naam} is verdwenen`)); continue; }
    const nieuwIds = new Map((n.mogelijkheden ?? []).map((m) => [m.id, m]));
    for (const m of d.mogelijkheden ?? []) {
      if (!nieuwIds.has(m.id)) z.push(fout('MOGELIJKHEID_VERDWENEN', `${naam}: можливість «${m.id}» зникла з досьє — не видаляйте, позначте стан (verloren / vervangen / ingetrokken) з причиною`, `${naam}: mogelijkheid «${m.id}» verdwenen — markeer de staat in plaats van te verwijderen`));
    }
    const nieuwWerk = new Set((n.werk ?? []).map((w) => `${w.taakId ?? ''}|${w.tak ?? ''}`));
    for (const w of d.werk ?? []) if (!nieuwWerk.has(`${w.taakId ?? ''}|${w.tak ?? ''}`)) z.push(fout('ONDERWERP_WERK_VERDWENEN', `${naam}: запис роботи ${w.taakId ?? w.tak} зник з досьє — історію лише доповнюють`, `${naam}: werkregel ${w.taakId ?? w.tak} verdwenen`));
    if ((n.opmerkingenEigenaar ?? []).length < (d.opmerkingenEigenaar ?? []).length) z.push(fout('OPMERKING_VERDWENEN', `${naam}: зникли зауваження власника — їх не видаляють, лише позначають «opgelost» з посиланням`, `${naam}: opmerkingen van de eigenaar verdwenen`));
  }
  if (oud.catalogus && nieuw.catalogus) z.push(...vaardighedenBehoud(oud.catalogus, nieuw.catalogus));
  return z;
}

const semverKleiner = (a, b) => { const x = String(a).split('.').map(Number); const y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); return false; };

/** Навички й їхні можливості не зникають; версія не зменшується. Можливість, яку один агент не підтримує, лишається (поле agenten). */
export function vaardighedenBehoud(oud, nieuw) {
  const z = []; const n = new Map((nieuw.vaardigheden ?? []).map((v) => [v.naam, v]));
  const ingetrokkenNamen = new Set((nieuw.ingetrokken ?? []).map((x) => x?.naam));
  for (const v of oud.vaardigheden ?? []) {
    const w = n.get(v.naam);
    if (!w) { if (!ingetrokkenNamen.has(v.naam)) z.push(fout('VAARDIGHEID_VERDWENEN', `навичка «${v.naam}» зникла з каталогу — навички не видаляють; щоб вивести з ужитку, додайте запис у ingetrokken з рішенням власника`, `vaardigheid «${v.naam}» verdwenen — niet verwijderen`)); continue; }
    if (semverKleiner(w.versie, v.versie)) z.push(fout('VAARDIGHEID_VERSIE', `навичка «${v.naam}»: версія ${w.versie} менша за попередню ${v.versie} — так затирають чужу новішу роботу`, `vaardigheid «${v.naam}»: versie ${w.versie} lager dan ${v.versie}`));
    const ids = new Set((w.mogelijkheden ?? []).map((m) => m.id)); const weg = new Set((w.ingetrokkenMogelijkheden ?? []).map((m) => m?.id));
    for (const m of v.mogelijkheden ?? []) if (!ids.has(m.id) && !weg.has(m.id)) z.push(fout('VAARDIGHEID_MOGELIJKHEID_VERDWENEN', `навичка «${v.naam}»: можливість «${m.id}» зникла — якщо якийсь агент її не підтримує, позначте це в agenten, а не видаляйте`, `vaardigheid «${v.naam}»: mogelijkheid «${m.id}» verdwenen — beperk via agenten, niet verwijderen`));
  }
  return z;
}

/** Підбір досьє за словами завдання й за зміненими файлами. */
const schoon = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[’'`]/g, '’').replace(/[^\p{L}\p{N}’]+/gu, ' ').trim();
export function kiesOnderwerpen(onderwerpen, { tekst: t = '', bestanden = [] } = {}) {
  const zin = ` ${schoon(t)} `; const uit = [];
  for (const d of onderwerpen) {
    let score = 0; const redenen = [];
    for (const term of [...(d.termen?.uk ?? []), ...(d.termen?.nl ?? []), d.naam]) {
      const s = schoon(term); if (s && zin.includes(` ${s}`)) { score += 2; redenen.push(term); }
    }
    const raak = bestanden.filter((b) => (d.paden ?? []).some((p) => b === p || b.startsWith(p.endsWith('/') ? p : `${p}`)));
    if (raak.length) { score += 3; redenen.push(`${raak.length} файл(и)`); }
    if (score) uit.push({ naam: d.naam, score, redenen, raak });
  }
  return uit.sort((a, b) => b.score - a.score || a.naam.localeCompare(b.naam));
}

/** Хронологія внесків задачі: для звіту, `orch begin` і пакета. */
export function bijdragenTijdlijn(bijdragen) {
  return [...bijdragen].sort((a, b) => String(a.tijd).localeCompare(String(b.tijd))).map((b) => {
    const u = b.uitvoerder ?? {};
    const wie = u.soort === 'ai' ? `${u.agent} · ${u.model?.id ?? '—'} (${u.platform ?? '—'})` : `${u.naam} (людина)`;
    return { id: b.id, tijd: b.tijd, taakId: b.taakId, wie, opdrachtgever: b.opdrachtgever?.naam ?? '', soort: b.soort, soortUk: SOORTEN[b.soort]?.uk ?? b.soort, wat: b.wat?.uk ?? '', waarom: b.waarom?.uk ?? '', bouwtVoortOp: b.bouwtVoortOp ?? [], tak: b.tak ?? '', pr: b.pr ?? null };
  });
}

/** Учасники випуску з обліку (людина-замовник + кожна пара агент/модель) у форматі UITROL-MANIFEST deelnemers. */
export function deelnemersUitBijdragen(bijdragen) {
  const mensen = new Map(); const ai = new Map();
  for (const b of bijdragen) {
    const o = tekst(b.opdrachtgever?.naam, 120); if (o) mensen.set(o, { soort: 'mens', naam: o, rollen: ['auteur'] });
    const u = b.uitvoerder ?? {};
    if (u.soort === 'mens' && u.naam) mensen.set(u.naam, { soort: 'mens', naam: u.naam, rollen: ['auteur', 'ontwikkeling'] });
    if (u.soort === 'ai') {
      const k = `${u.agent}|${u.model?.id}`;
      const rol = b.soort === 'controle' ? 'controle' : 'ontwikkeling';
      const d = ai.get(k) ?? { soort: 'ai', naam: u.agent, platform: u.platform, tool: u.tool ?? u.platform, model: { id: u.model?.id ?? null, versie: null, bron: u.model?.bron === 'omgeving' ? 'omgeving' : 'auteur' }, rollen: [] };
      if (!d.rollen.includes(rol)) d.rollen.push(rol);
      ai.set(k, d);
    }
  }
  return [...mensen.values(), ...ai.values()];
}

/** Стислий вигляд внеску для UITROL-MANIFEST.json → bijdragen (сторінка оновлень на сайті). */
export function manifestBijdragen(bijdragen) {
  return bijdragenTijdlijn(bijdragen).slice(0, 200).map((b) => {
    const src = bijdragen.find((x) => x.id === b.id) ?? {};
    const u = src.uitvoerder ?? {};
    return {
      taakId: b.taakId, tijd: b.tijd, soort: b.soort,
      wie: u.soort === 'ai' ? { soort: 'ai', naam: u.agent, model: u.model?.id ?? null, platform: u.platform ?? null } : { soort: 'mens', naam: u.naam },
      opdrachtgever: b.opdrachtgever, wat: { uk: b.wat, ...(src.wat?.nl ? { nl: src.wat.nl } : {}) },
      ...(b.waarom ? { waarom: { uk: b.waarom, ...(src.waarom?.nl ? { nl: src.waarom.nl } : {}) } } : {}),
      tak: b.tak || null, pr: b.pr,
    };
  });
}

export { fout, waarsch };
