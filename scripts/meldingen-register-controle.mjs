#!/usr/bin/env node
// MELDINGEN-REGISTER-001: обов'язковий сторож єдиної бази сповіщень і кодів дій під час складання.
// Гарантує, що жодна нова розробка на сервері (backend/ чи server/) не створює сліпих сповіщень
// на кшталт «Дія в технічному просторі» без власної двомовної назви (ACTIE_LABELS) і категорії (CATEGORIEEN).
// Verplichte bouwwachter voor het meldingen- en actieregister: geen enkele serveractie zonder uk/nl-label of met categorie 'overig'.

import fs from 'node:fs';
import path from 'node:path';
import { ACTIE_LABELS, categorieVan, isRuis } from '../shared/beheer-journaal.ts';

const stil = process.argv.includes('--stil');
const wortel = process.cwd();

const STILLE_SITE_CODES = /^(owner\.ruimte\.geweigerd$|owner\.extensie\.zijpaneel\.chat$|owner\.meldingen\.(ecosysteem\.(actie|profiel|ontvangst|aflevering_overzicht)|bijlage\.telegram)$|owner\.mcp\.tools\.list$|owner\.extensie\.beheer\.bekeken$|owner\.terminal\.opdrachten\.bekeken$|klimop_(overzicht|dubbel_logboek|quorum_logboek|spiegel_logboek)$|owner\.notifications\.|owner\.session\.(rotated|refresh|migrated\.to-ecosystem|restored\.remembered)|telegram\.venster\.geopend$|owner\.ui\.|owner\.tab\.|owner\.mail\.(item\.|send\.prepared)|owner\.admin\.(audit\.viewed|diagnostics)|owner\.redirect\.|owner\.auth\.transaction\.(created|started)|owner\.browser\.grant\.(used|cookie))/;
const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;

function verzamelBestanden(mapPad) {
  const uit = [];
  const vol = path.join(wortel, mapPad);
  if (!fs.existsSync(vol)) return uit;
  for (const e of fs.readdirSync(vol, { withFileTypes: true })) {
    const p = path.join(mapPad, e.name);
    if (e.isDirectory()) uit.push(...verzamelBestanden(p));
    else if (/\.(ts|mjs)$/.test(e.name)) uit.push(p);
  }
  return uit;
}

function uitgebalanceerd(tekst, openPos, openTeken, sluitTeken) {
  let diepte = 0;
  let citaat = '';
  for (let i = openPos; i < tekst.length; i += 1) {
    const ch = tekst[i];
    if (citaat) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === citaat) citaat = '';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      citaat = ch;
      continue;
    }
    if (ch === openTeken) diepte += 1;
    else if (ch === sluitTeken) {
      diepte -= 1;
      if (diepte === 0) return tekst.slice(openPos + 1, i);
    }
  }
  return '';
}

function topDelen(inhoud, scheiding = ',') {
  const delen = [];
  let start = 0;
  let rond = 0;
  let krul = 0;
  let blok = 0;
  let citaat = '';
  for (let i = 0; i < inhoud.length; i += 1) {
    const ch = inhoud[i];
    if (citaat) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === citaat) citaat = '';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      citaat = ch;
      continue;
    }
    if (ch === '(') rond += 1;
    else if (ch === ')') rond = Math.max(0, rond - 1);
    else if (ch === '{') krul += 1;
    else if (ch === '}') krul = Math.max(0, krul - 1);
    else if (ch === '[') blok += 1;
    else if (ch === ']') blok = Math.max(0, blok - 1);
    else if (ch === scheiding && rond === 0 && krul === 0 && blok === 0) {
      delen.push(inhoud.slice(start, i).trim());
      start = i + 1;
    }
  }
  const rest = inhoud.slice(start).trim();
  if (rest) delen.push(rest);
  return delen;
}

function haalLetterlijkeCodesUitExpressie(expr) {
  if (!expr) return [];
  const zonderVergelijking = expr.replace(/[!=]==?\s*['"][^'"]*['"]/g, ' ');
  const uit = [];
  for (const m of zonderVergelijking.matchAll(/['"]([a-zA-Z0-9_.:-]{2,90})['"]/g)) {
    uit.push(m[1]);
  }
  return uit;
}

const gevondenCodes = new Map();
function registreerCode(code, relPad, eisScheiding = true) {
  if (!code || code.length < 4 || code.length > 90) return;
  if (eisScheiding && !/[._:-]/.test(code) && code !== 'sign_in') return;
  if (!gevondenCodes.has(code)) gevondenCodes.set(code, relPad);
}

for (const hoofdMap of ['backend', 'server']) {
  for (const relPad of verzamelBestanden(hoofdMap)) {
    const genormPad = relPad.replace(/\\/g, '/');
    const inhoud = fs.readFileSync(path.join(wortel, relPad), 'utf8');

    // 1. Об'єктні виклики журналювання (auditToevoegen, journaalSchrijf, schrijfBeheerAudit, agentAudit, auditStil, auditLog)
    for (const m of inhoud.matchAll(/\b(?:auditToevoegen|journaalSchrijf|schrijfBeheerAudit|agentAudit|auditStil|auditLog)\s*\(/g)) {
      const haakOpen = m.index + m[0].length - 1;
      const argsTekst = uitgebalanceerd(inhoud, haakOpen, '(', ')');
      const eersteArg = topDelen(argsTekst, ',')[0] || '';
      const krulPos = eersteArg.indexOf('{');
      if (krulPos < 0) continue;
      const objInhoud = uitgebalanceerd(eersteArg, krulPos, '{', '}');
      for (const veld of topDelen(objInhoud, ',')) {
        const vm = /^(?:action|actie)\s*:\s*([\s\S]+)$/.exec(veld);
        if (!vm) continue;
        for (const c of haalLetterlijkeCodesUitExpressie(vm[1])) {
          registreerCode(c, genormPad, true);
        }
      }
    }

    // 2. Префіксні обгортки входу й підтвердження через Telegram та пристрій
    const isTelegramMap = genormPad.startsWith('backend/telegram-aanmelden/') && !genormPad.endsWith('/plaatsing.ts');
    const isApparaatMap = genormPad.startsWith('backend/apparaat-bevestiging/');

    if (isTelegramMap || isApparaatMap) {
      const voorvoegsel = isTelegramMap ? 'telegram.' : 'apparaat.';
      for (const m of inhoud.matchAll(/(?<!function\s)\b(audit|beheerAlarm|auditBeheer)\s*\(/g)) {
        const naam = m[1];
        const args = topDelen(uitgebalanceerd(inhoud, m.index + m[0].length - 1, '(', ')'), ',');
        const idx = naam === 'beheerAlarm' ? 0 : 1;
        const subVoorvoegsel =
          naam === 'beheerAlarm'
            ? `${voorvoegsel}alarm.`
            : naam === 'auditBeheer'
              ? 'telegram.beheer.'
              : voorvoegsel;
        for (const c of haalLetterlijkeCodesUitExpressie(args[idx] || '')) {
          if (c.length >= 2) registreerCode(`${subVoorvoegsel}${c}`, genormPad, true);
        }
      }
      continue;
    }

    // 3. Спеціальні префіксні обгортки черги листів у mail-opstel.ts та підтверджень ШІ у ai-bevestiging.ts
    if (genormPad === 'backend/mail-opstel.ts') {
      for (const m of inhoud.matchAll(/(?<!function\s)\bwachtrijSpoor\s*\(/g)) {
        const args = topDelen(uitgebalanceerd(inhoud, m.index + m[0].length - 1, '(', ')'), ',');
        for (const c of haalLetterlijkeCodesUitExpressie(args[1] || '')) {
          registreerCode(`owner.mail.queue.${c}`, genormPad, true);
        }
      }
    }
    if (genormPad === 'backend/ai-bevestiging.ts') {
      for (const m of inhoud.matchAll(/(?<!function\s)\bjournaal\s*\(/g)) {
        const args = topDelen(uitgebalanceerd(inhoud, m.index + m[0].length - 1, '(', ')'), ',');
        for (const c of haalLetterlijkeCodesUitExpressie(args[1] || '')) {
          if (c.length >= 2) registreerCode(`owner.ai.bevestiging.${c}`, genormPad, true);
        }
      }
      continue;
    }

    // 4. Позиційні обгортки з кодом дії у 2-му аргументі (ownerAudit, writeAudit, logboek, journaal, auditeer, audit)
    const drieArgBestanden = new Set([
      'backend/uitrol-goedkeuring.ts',
      'backend/ondersteuning.ts',
      'backend/tech-profiel.ts',
      'backend/impersonatie.ts',
    ]);
    const overslaanGeneriekAudit = new Set([
      'backend/index.ts',
      'backend/db.ts',
      'backend/cloud-platform.ts',
      'backend/google-suite-inrichting.ts',
    ]);

    for (const m of inhoud.matchAll(/(?<!function\s)\b(ownerAudit|writeAudit|logboek|journaal|auditeer|huisAudit|audit)\s*\(/g)) {
      const fn = m[1];
      if (fn === 'audit' && overslaanGeneriekAudit.has(genormPad)) continue;
      const args = topDelen(uitgebalanceerd(inhoud, m.index + m[0].length - 1, '(', ')'), ',');
      const argIdx =
        fn === 'huisAudit' || (drieArgBestanden.has(genormPad) && (fn === 'auditeer' || fn === 'audit'))
          ? 2
          : 1;
      for (const c of haalLetterlijkeCodesUitExpressie(args[argIdx] || '')) {
        registreerCode(c, genormPad, true);
      }
    }
  }
}

const fouten = [];

// 1. Кожен серверний код дії має бути описаний у ACTIE_LABELS і мати конкретну категорію (не 'overig').
for (const [code, bestand] of [...gevondenCodes.entries()].sort()) {
  if (isRuis(code) || STILLE_SITE_CODES.test(code)) continue;
  if (!(code in ACTIE_LABELS)) {
    fouten.push(`Код дії «${code}» (${bestand}) відсутній у ACTIE_LABELS (shared/beheer-journaal.ts) — додайте двомовний опис [uk, nl].`);
  }
  if (categorieVan(code) === 'overig') {
    fouten.push(`Код дії «${code}» (${bestand}) потрапляє в категорію 'overig' («Дія в технічному просторі») — додайте префікс до CATEGORIEEN у shared/beheer-journaal.ts.`);
  }
}

// 2. Кожен запис у ACTIE_LABELS має непорожній переклад uk/nl без заборонених літер і конкретну категорію.
for (const [code, paar] of Object.entries(ACTIE_LABELS)) {
  const [uk, nl] = paar || ['', ''];
  if (!uk?.trim() || !nl?.trim()) {
    fouten.push(`ACTIE_LABELS['${code}'] має порожній текст uk або nl.`);
  }
  if (VERBODEN_LETTERS.test(`${uk} ${nl}`)) {
    fouten.push(`ACTIE_LABELS['${code}'] містить заборонені не-українські літери.`);
  }
  if (categorieVan(code) === 'overig') {
    fouten.push(`ACTIE_LABELS['${code}'] має категорію 'overig' — прив’яжіть до предметної категорії CATEGORIEEN.`);
  }
}

if (fouten.length > 0) {
  console.error(`[meldingen-register-controle] Виявлено порушень бази сповіщень (${fouten.length}):`);
  for (const f of fouten.slice(0, 40)) console.error(`  ✗ ${f}`);
  process.exit(1);
}

if (!stil) {
  console.log(
    `[meldingen-register-controle] OK · перевірено серверних кодів дій: ${gevondenCodes.size}, записів ACTIE_LABELS: ${Object.keys(ACTIE_LABELS).length}, 'overig': 0`,
  );
}
