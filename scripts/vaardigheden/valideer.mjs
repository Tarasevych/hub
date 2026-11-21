// Контроль каталогу та файлів модульних навичок (.agents/skills/* + scripts/vaardigheden/catalogus.json).
// Перевіряє взаємну відповідність навичок, SemVer-версії, ациклічний граф залежностей,
// справжні ключі інструментів (<id>:<kant>) із shared/connector-v2/catalogus.ts, YAML frontmatter на 1-му рядку та мовний закон.
// Gebruik: node scripts/vaardigheden/valideer.mjs [--stil]

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BESTAND = fileURLToPath(import.meta.url);
const WORTEL = path.resolve(path.dirname(BESTAND), '../..');

const NAAM_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const HULPMIDDEL_RE = /^[a-z0-9][a-z0-9_.-]{1,79}(?::(?:gebruiker|beheer))?$/;
const CYRILLISCH = /[\u0400-\u04FF]/;
const LATIJNS = /[A-Za-z]/;
const RU_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const TECH_JARGON = new RegExp(
  '(?:^|[^\\p{L}])(' +
    [
      '\u0431\u0430\u0433',
      '\u0431\u0430\u0433\u0438',
      '\u0431\u0430\u0433\u0456\u0432',
      '\u0444\u0456\u043a\u0441',
      '\u0444\u0456\u043a\u0441\u0438',
      '\u0431\u0456\u043b\u0434',
      '\u0431\u0456\u043b\u0434\u0443',
      '\u0434\u0435\u043f\u043b\u043e\u0439',
      '\u0434\u0435\u043f\u043b\u043e\u044e',
      '\u043a\u043e\u043c\u0456\u0442',
      '\u043a\u043e\u043c\u0456\u0442\u0443',
      '\u0431\u0440\u0435\u043d\u0447',
      '\u043f\u0443\u043b-?\u0440\u0435\u043a\u0432\u0435\u0441\u0442',
      '\u0442\u0430\u0441\u043a\u0430',
      '\u0442\u0430\u0441\u043a\u0443',
      '\u0444\u0456\u0447\u0430',
      '\u0444\u0456\u0447\u0456',
      '\u043a\u0435\u0448',
      '\u043c\u0456\u043a\u0440\u043e\u043a\u0435\u0448\u0443\u0432\u0430\u043d\u043d\u044f',
      '\u0431\u0435\u043a\u0430\u043f',
      '\u0434\u0435\u0444\u043e\u043b\u0442\u043d',
      '\u043a\u0430\u0441\u0442\u043e\u043c\u043d',
      '\u0430\u043f\u0434\u0435\u0439\u0442',
      '\u0441\u043a\u0440\u0456\u043d\u0448\u043e\u0442',
      '\u043b\u0435\u0439\u0430\u0443\u0442',
      '\u0432\u043e\u0442\u0435\u0440\u0444\u043e\u043b',
      '\u0442\u0430\u0439\u043c\u0430\u0443\u0442',
      '\u0447\u0435\u043a-?\u043b\u0456\u0441\u0442',
      '\u0434\u0435\u0434\u0443\u043f\u043b\u0456\u043a\u0430\u0446\u0456\u044f',
    ].join('|') +
    ')(?:[^\\p{L}]|$)',
  'iu',
);

function verzamelBestanden(mapPad, basisWortel) {
  const uit = [];
  if (!existsSync(mapPad)) return uit;
  for (const naam of readdirSync(mapPad).sort()) {
    const vol = path.join(mapPad, naam);
    const st = statSync(vol);
    if (st.isDirectory()) {
      uit.push(...verzamelBestanden(vol, basisWortel));
    } else {
      uit.push(path.relative(basisWortel, vol).replace(/\\/g, '/'));
    }
  }
  return uit;
}

export function laadV2CatalogusSleutels(wortel = WORTEL) {
  const pad = path.join(wortel, 'shared/connector-v2/catalogus.ts');
  const sleutels = new Set();
  const ids = new Set();
  if (!existsSync(pad)) {
    return { sleutels, ids, fout: 'shared/connector-v2/catalogus.ts ontbreekt' };
  }
  const tekst = readFileSync(pad, 'utf8');
  const defsStart = tekst.indexOf('const DEFS:');
  const blok = defsStart >= 0 ? tekst.slice(defsStart) : tekst;
  const re = /\{\s*id:\s*'([^']+)'[^}]*?\bkanten:\s*(BEIDE|G|B|\[[^\]]+\])/g;
  let m;
  while ((m = re.exec(blok))) {
    const id = m[1];
    const ruwKanten = m[2];
    const kanten =
      ruwKanten === 'BEIDE'
        ? ['gebruiker', 'beheer']
        : ruwKanten === 'G'
          ? ['gebruiker']
          : ruwKanten === 'B'
            ? ['beheer']
            : [...ruwKanten.matchAll(/'(gebruiker|beheer)'/g)].map((k) => k[1]);
    ids.add(id);
    for (const kant of kanten) {
      sleutels.add(`${id}:${kant}`);
    }
  }
  return { sleutels, ids, fout: sleutels.size === 0 ? 'Geen V2-opties geparseerd uit catalogus.ts' : null };
}

// KLIMOP-018 (21.11.2026): навички, обов'язкові для всіх 14 агентів, та перевірка посилань перехідників на мовний закон.
// Незалежна перевірка «Плюща» виявила, що навички movnyi-zakon у сховищі не було, а штатний перевіряльник цього не помічав.
export const VERPLICHTE_VAARDIGHEDEN = Object.freeze(['movnyi-zakon', 'klimop-architectuur', 'bijdragen-vastleggen']);
export const TAALWET_VERWIJZING = '.agents/skills/movnyi-zakon/SKILL.md';
const VOORBEELD_TABEL_RE = /<!-- taalwet:verboden-voorbeelden:begin -->[\s\S]*?<!-- taalwet:verboden-voorbeelden:einde -->/g;
export function zonderVoorbeeldTabel(rel, tekst) {
  return rel === TAALWET_VERWIJZING ? tekst.replace(VOORBEELD_TABEL_RE, '') : tekst;
}

/** Перехідники агентів із orchestratie/beleid.json, які не посилаються на спільну навичку мовного закону. */
export function adaptersZonderTaalwet(wortel = WORTEL) {
  const uit = [];
  let beleid = null;
  try {
    beleid = JSON.parse(readFileSync(path.join(wortel, 'orchestratie/beleid.json'), 'utf8'));
  } catch {
    return uit;
  }
  for (const a of beleid?.agenten ?? []) {
    if (!a?.adapter) continue;
    const pad = path.join(wortel, a.adapter);
    if (!existsSync(pad)) { uit.push(`${a.id}: ${a.adapter} ontbreekt`); continue; }
    if (!readFileSync(pad, 'utf8').includes(TAALWET_VERWIJZING)) uit.push(`${a.id}: ${a.adapter} verwijst niet naar ${TAALWET_VERWIJZING}`);
  }
  return uit;
}

function parseerFrontmatter(inhoud) {
  if (!inhoud.startsWith('---\n')) return null;
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(inhoud);
  if (!m) return null;
  const meta = {};
  for (const regel of m[1].split('\n')) {
    const idx = regel.indexOf(':');
    if (idx <= 0) continue;
    const sleutel = regel.slice(0, idx).trim().toLowerCase();
    const waarde = regel.slice(idx + 1).trim();
    meta[sleutel] = waarde;
  }
  return { meta, inhoudNaKop: m[2] };
}

export function valideerVaardigheden(wortel = WORTEL) {
  const fouten = [];
  const waarschuwingen = [];
  const skillsMap = path.join(wortel, '.agents/skills');
  const catalogusPad = path.join(wortel, 'scripts/vaardigheden/catalogus.json');

  if (!existsSync(skillsMap)) {
    fouten.push('.agents/skills-map ontbreekt');
  }
  if (!existsSync(catalogusPad)) {
    fouten.push('scripts/vaardigheden/catalogus.json ontbreekt');
  }

  const v2 = laadV2CatalogusSleutels(wortel);
  if (v2.fout) {
    fouten.push(v2.fout);
  }

  let catalogus = null;
  if (existsSync(catalogusPad)) {
    try {
      catalogus = JSON.parse(readFileSync(catalogusPad, 'utf8'));
    } catch (e) {
      fouten.push(`catalogus.json ongeldige JSON: ${(e && e.message) || e}`);
    }
  }

  const mappen = existsSync(skillsMap)
    ? readdirSync(skillsMap, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : [];

  if (!catalogus || catalogus.schema !== 1 || !Array.isArray(catalogus.vaardigheden)) {
    fouten.push('catalogus.json: schema !== 1 of ontbrekende vaardighedenlijst');
    return {
      ok: false,
      fouten,
      waarschuwingen,
      aantallen: { mappen: mappen.length, catalogus: 0, hulpmiddelSleutels: v2.sleutels.size },
    };
  }

  const perNaam = new Map();
  for (const v of catalogus.vaardigheden) {
    const naam = String(v?.naam ?? '');
    if (!NAAM_RE.test(naam)) {
      fouten.push(`ongeldige vaardigheidsnaam: ${JSON.stringify(v?.naam)}`);
      continue;
    }
    if (perNaam.has(naam)) {
      fouten.push(`dubbele vaardigheid in catalogus.json: ${naam}`);
      continue;
    }
    perNaam.set(naam, v);

    if (v.pad !== `.agents/skills/${naam}/SKILL.md`) {
      fouten.push(`${naam}: pad moet .agents/skills/${naam}/SKILL.md zijn (nu: ${v.pad})`);
    }
    if (typeof v.versie !== 'string' || !SEMVER_RE.test(v.versie)) {
      fouten.push(`${naam}: ongeldige of ontbrekende SemVer-versie (${JSON.stringify(v.versie)})`);
    }
    if (!Array.isArray(v.afhankelijkheden)) {
      fouten.push(`${naam}: afhankelijkheden moet een lijst zijn`);
    }
    if (typeof v.samenvatting?.uk !== 'string' || !CYRILLISCH.test(v.samenvatting.uk)) {
      fouten.push(`${naam}: ontbrekende of niet-Oekraïense samenvatting.uk`);
    }
    if (typeof v.samenvatting?.nl !== 'string' || !LATIJNS.test(v.samenvatting.nl)) {
      fouten.push(`${naam}: ontbrekende of ongeldige samenvatting.nl`);
    }
    if (!Array.isArray(v.termen?.uk) || v.termen.uk.length === 0 || !Array.isArray(v.termen?.nl) || v.termen.nl.length === 0) {
      fouten.push(`${naam}: termen.uk en termen.nl moeten niet-leeg zijn`);
    }
    if (!Array.isArray(v.vereisteHulpmiddelen)) {
      fouten.push(`${naam}: vereisteHulpmiddelen moet een lijst zijn`);
    } else {
      for (const h of v.vereisteHulpmiddelen) {
        if (typeof h !== 'string' || !HULPMIDDEL_RE.test(h)) {
          fouten.push(`${naam}: ongeldig hulpmiddelformaat "${h}"`);
          continue;
        }
        if (v2.sleutels.size > 0) {
          const geldig = h.includes(':') ? v2.sleutels.has(h) : v2.ids.has(h);
          if (!geldig) {
            fouten.push(`${naam}: onbekend hulpmiddel "${h}" (niet gevonden in shared/connector-v2/catalogus.ts)`);
          }
        }
      }
    }
    // BIJDRAGE-001: можливості навички — незмінні id, опис українською, підтримка агентами (агент без підтримки не видаляє опцію).
    if (v.mogelijkheden !== undefined) {
      if (!Array.isArray(v.mogelijkheden)) fouten.push(`${naam}: mogelijkheden moet een lijst zijn`);
      else {
        const gezien = new Set();
        for (const m of v.mogelijkheden) {
          if (!m || !NAAM_RE.test(m.id ?? '')) { fouten.push(`${naam}: mogelijkheid zonder geldige id`); continue; }
          if (gezien.has(m.id)) fouten.push(`${naam}: mogelijkheid "${m.id}" dubbel`);
          gezien.add(m.id);
          if (typeof m.uk !== 'string' || !CYRILLISCH.test(m.uk) || m.uk.trim().length < 10) fouten.push(`${naam}: mogelijkheid "${m.id}" mist een Oekraïense omschrijving`);
          if (m.agenten !== undefined && (!Array.isArray(m.agenten) || !m.agenten.every((x) => typeof x === 'string' && /^[a-z][a-z0-9-]{1,30}$/.test(x)))) fouten.push(`${naam}: mogelijkheid "${m.id}": agenten moet een lijst agent-id's zijn`);
        }
      }
    }
    if (v.ookBekendAls !== undefined && (!Array.isArray(v.ookBekendAls) || !v.ookBekendAls.every((x) => x && typeof x.naam === 'string' && x.naam && typeof x.bron === 'string'))) fouten.push(`${naam}: ookBekendAls moet een lijst { bron, naam } zijn`);
  }

  // Wederzijdse 1-op-1-afdekking tussen .agents/skills/* en catalogus.json
  for (const mapNaam of mappen) {
    if (!perNaam.has(mapNaam)) {
      fouten.push(`map .agents/skills/${mapNaam} ontbreekt in catalogus.json`);
    }
  }
  const mappenSet = new Set(mappen);
  for (const naam of perNaam.keys()) {
    if (!mappenSet.has(naam)) {
      fouten.push(`catalogus.json vermeldt "${naam}", maar map .agents/skills/${naam} ontbreekt`);
    }
  }

  // KLIMOP-018: обов'язкові спільні навички та посилання всіх перехідників на мовний закон.
  for (const naam of VERPLICHTE_VAARDIGHEDEN) {
    if (!perNaam.has(naam)) fouten.push(`verplichte vaardigheid "${naam}" ontbreekt in catalogus.json (обов'язкова навичка відсутня)`);
  }
  for (const f of adaptersZonderTaalwet(wortel)) fouten.push(`taalwet-adapter: ${f}`);

  // Afhankelijkheidsgraaf: geldige verwijzingen, geen zelfverwijzing, 3-kleuren-DFS tegen cycli
  for (const [naam, v] of perNaam.entries()) {
    if (!Array.isArray(v.afhankelijkheden)) continue;
    for (const dep of v.afhankelijkheden) {
      if (typeof dep !== 'string' || !perNaam.has(dep)) {
        fouten.push(`${naam}: onbekende afhankelijkheid "${dep}"`);
      } else if (dep === naam) {
        fouten.push(`${naam}: mag niet van zichzelf afhankelijk zijn`);
      }
    }
  }
  const kleur = new Map(); // 0 = nieuw, 1 = bezig, 2 = klaar
  const padStack = [];
  const bezoek = (naam) => {
    const k = kleur.get(naam) ?? 0;
    if (k === 1) {
      const start = padStack.indexOf(naam);
      const cyclus = [...padStack.slice(start), naam].join(' -> ');
      fouten.push(`afhankelijkheidscyclus gevonden: ${cyclus}`);
      return;
    }
    if (k === 2) return;
    kleur.set(naam, 1);
    padStack.push(naam);
    const item = perNaam.get(naam);
    if (Array.isArray(item?.afhankelijkheden)) {
      for (const dep of item.afhankelijkheden) {
        if (typeof dep === 'string' && perNaam.has(dep) && dep !== naam) {
          bezoek(dep);
        }
      }
    }
    padStack.pop();
    kleur.set(naam, 2);
  };
  for (const naam of perNaam.keys()) {
    bezoek(naam);
  }

  // SKILL.md frontmatter + bestandsgrootte voor elke vaardigheid
  for (const [naam, v] of perNaam.entries()) {
    const skillPad = path.join(wortel, `.agents/skills/${naam}/SKILL.md`);
    if (!existsSync(skillPad)) {
      fouten.push(`${naam}: SKILL.md ontbreekt`);
      continue;
    }
    const inhoud = readFileSync(skillPad, 'utf8');
    if (Buffer.byteLength(inhoud, 'utf8') > 96_000) {
      fouten.push(`${naam}: SKILL.md overschrijdt 96.000 bytes`);
    }
    const fm = parseerFrontmatter(inhoud);
    if (!fm) {
      fouten.push(`${naam}: SKILL.md moet op regel 1 exact met YAML --- beginnen en sluiten`);
      continue;
    }
    if (fm.meta.name !== naam) {
      fouten.push(`${naam}: frontmatter name="${fm.meta.name ?? ''}" komt niet overeen met "${naam}"`);
    }
    const desc = fm.meta.description ?? '';
    if (!desc || !CYRILLISCH.test(desc) || !LATIJNS.test(desc)) {
      fouten.push(`${naam}: frontmatter description moet tweetalig zijn (uk + nl)`);
    }
    if (!fm.inhoudNaKop.trim()) {
      fouten.push(`${naam}: SKILL.md heeft geen instructietekst na frontmatter`);
    }
    if (Array.isArray(v.vereisteHulpmiddelen) && v.vereisteHulpmiddelen.some((h) => h.includes(':beheer')) && desc.length < 15) {
      fouten.push(`${naam}: onvolledige beschrijving`);
    }
  }

  // Taalzuiverheid op alle bestanden in .agents/skills/ en scripts/vaardigheden/
  const teControleren = [
    ...verzamelBestanden(skillsMap, wortel),
    ...verzamelBestanden(path.join(wortel, 'scripts/vaardigheden'), wortel),
  ];
  for (const rel of teControleren) {
    const tekst = readFileSync(path.join(wortel, rel), 'utf8');
    if (RU_LETTERS.test(tekst)) {
      fouten.push(`taalwet: verboden Russische letters in ${rel}`);
    }
    // KLIMOP-018: лише в навичці movnyi-zakon таблиця «заборонено → уживати» між межами taalwet:verboden-voorbeelden
    // навмисно наводить заборонені слова як приклади; поза цими межами перевірка жаргону діє повністю.
    const mJargon = TECH_JARGON.exec(zonderVoorbeeldTabel(rel, tekst));
    if (mJargon) {
      fouten.push(`taalwet: verboden tech-jargon "${mJargon[1]}" in ${rel}`);
    }
  }

  return {
    ok: fouten.length === 0,
    fouten,
    waarschuwingen,
    aantallen: {
      mappen: mappen.length,
      catalogus: perNaam.size,
      hulpmiddelSleutels: v2.sleutels.size,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === BESTAND) {
  const stil = process.argv.includes('--stil');
  const res = valideerVaardigheden();
  for (const w of res.waarschuwingen) {
    console.warn(`[vaardigheden] waarschuwing: ${w}`);
  }
  if (!res.ok) {
    for (const f of res.fouten) {
      console.error(`[vaardigheden] FOUT: ${f}`);
    }
    process.exit(1);
  }
  if (!stil) {
    console.log(
      `[vaardigheden] ok: ${res.aantallen.catalogus} vaardigheden, ${res.aantallen.mappen} mappen, ${res.aantallen.hulpmiddelSleutels} V2-hulpmiddelsleutels gecontroleerd`,
    );
  }
}
