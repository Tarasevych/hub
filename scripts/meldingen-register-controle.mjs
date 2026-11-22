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

const STILLE_SITE_CODES = /^(owner\.ruimte\.geweigerd$|owner\.extensie\.zijpaneel\.chat$|owner\.meldingen\.ecosysteem\.(actie|profiel)$|owner\.mcp\.tools\.list$|owner\.extensie\.beheer\.bekeken$|owner\.terminal\.opdrachten\.bekeken$|klimop_(overzicht|dubbel_logboek|quorum_logboek|spiegel_logboek)$|owner\.notifications\.|owner\.session\.(rotated|refresh)|owner\.ui\.|owner\.tab\.|owner\.mail\.(item\.|send\.prepared)|owner\.admin\.(audit\.viewed|diagnostics)|owner\.redirect\.|owner\.auth\.transaction\.(created|started)|owner\.browser\.grant\.(used|cookie))/;
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

const gevondenCodes = new Map();
for (const hoofdMap of ['backend', 'server']) {
  for (const relPad of verzamelBestanden(hoofdMap)) {
    const inhoud = fs.readFileSync(path.join(wortel, relPad), 'utf8');
    for (const m of inhoud.matchAll(/\b(?:auditToevoegen|journaalSchrijf)\s*\(\s*\{[\s\S]{0,220}?\b(?:action|actie)\s*:\s*['"]([a-zA-Z0-9_.:-]{4,80})['"]/g)) {
      if (!gevondenCodes.has(m[1])) gevondenCodes.set(m[1], relPad);
    }
    for (const m of inhoud.matchAll(/\b(?:writeAudit|schrijfBeheerAudit|audit)\s*\(\s*[^,()]+,\s*['"]([a-zA-Z0-9_.:-]{4,80})['"]/g)) {
      if (/[._-]/.test(m[1]) && !gevondenCodes.has(m[1])) gevondenCodes.set(m[1], relPad);
    }
    for (const m of inhoud.matchAll(/\bauditLog\s*\(\s*\{[\s\S]{0,220}?\baction\s*:\s*['"]([a-zA-Z0-9_.:-]{4,80})['"]/g)) {
      if (!gevondenCodes.has(m[1])) gevondenCodes.set(m[1], relPad);
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
