// Audit 18.10.2026, punt 2: elke uitkomst- en weigercode van de uitrolketen heeft een vertaling (uk + nl) in de interface.
// Deze test LEEST de scripts (root, GitOps, nazorg, installer, passkey-hulp) en de app-code, verzamelt alle codes en faalt zodra er één
// in een script staat die in shared/uitrol-codes.ts ontbreekt — vroeger toonde de site dan de kale code (bv. «INHOUD_ONVEILIG»).
import { readFileSync } from 'node:fs';
import { UITROL_CODES, uitrolCodeDoen, uitrolCodeTitel } from '../../shared/uitrol-codes';
import { codeHulp, codeTekst, foutTekst, isHerstart } from '../../src/uitrol/fouten';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');
const alle = (tekst: string, re: RegExp) => [...tekst.matchAll(re)].map((m) => m[1]);

export function codesUitScripts(): Record<string, string[]> {
  const sh = (p: string) => { const t = lees(p); return [...alle(t, /\bweiger "?([A-Z][A-Z0-9_]{2,})/g), ...alle(t, /\bstatus [a-z]+ "?([A-Z][A-Z0-9_]{2,})/g), ...alle(t, /\bgebeurtenis "?([A-Z][A-Z0-9_]{2,})/g), ...alle(t, /\bcode=([A-Z][A-Z0-9_]{2,})\b/g)]; };
  const hulp = lees('deploy/goedkeuring/goedkeur-hulp.mjs'); const kern = lees('deploy/goedkeuring/webauthn-kern.mjs');
  const teksten = hulp.slice(hulp.indexOf('const TEKSTEN'), hulp.indexOf('};', hulp.indexOf('const TEKSTEN')));
  const js = (t: string) => [...alle(t, /\buit\("([A-Z][A-Z0-9_]{2,})"/g), ...alle(t, /\b(?:code|fout): "([A-Z][A-Z0-9_]{2,})"/g), ...alle(t, /Error\("([A-Z][A-Z0-9_]{2,})"\)/g), ...alle(t, /return "([A-Z][A-Z0-9_]{2,})"/g)];
  return {
    'mijn-ruimte-uitrol.sh': sh('deploy/uitrol/mijn-ruimte-uitrol.sh'),
    'gitops-ophalen.sh': sh('deploy/gitops/gitops-ophalen.sh'),
    'mijn-ruimte-nazorg.sh': alle(lees('deploy/uitrol/mijn-ruimte-nazorg.sh'), /"(NAZORG_[A-Z_]+)"/g),
    'installeer-app.sh': [...alle(lees('deploy/installeer-app.sh'), /\bnoteer_[a-z_]+ ([A-Z][A-Z0-9_]{2,})/g), ...alle(lees('deploy/installeer-app.sh'), /\b(SSH_(?:OK|TERUG))\b/g)],
    'goedkeur-hulp.mjs': [...alle(teksten, /^\s+([A-Z][A-Z0-9_]{2,}): \[/gm), ...js(hulp)],
    'webauthn-kern.mjs': js(kern),
    'app (uitrol-runs/goedkeuring)': [...alle(lees('backend/uitrol-runs.ts'), /\bcode = '([A-Z][A-Z0-9_]{2,})'/g), ...alle(lees('backend/uitrol-goedkeuring.ts'), /\bcode = '([A-Z][A-Z0-9_]{2,})'/g), 'GEWEIGERD', 'INSTALLATIE_MISLUKT', 'VOORCONTROLE_MISLUKT'],
  };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-codes');
  const bronnen = codesUitScripts();
  const totaal = new Set(Object.values(bronnen).flat());
  check('codes gevonden in alle bronnen (de parser werkt)', Object.values(bronnen).every((l) => l.length > 0) && totaal.size > 60, `${totaal.size} ${JSON.stringify(Object.fromEntries(Object.entries(bronnen).map(([k, v]) => [k, v.length])))}`);
  for (const [bron, codes] of Object.entries(bronnen)) {
    const ontbreekt = [...new Set(codes)].filter((c) => !UITROL_CODES[c]);
    check(`${bron}: elke code heeft een vertaling in shared/uitrol-codes.ts`, ontbreekt.length === 0, ontbreekt.join(', '));
  }
  check('de nieuwe codes van de audit staan erin (AFGEBROKEN, ONDERBROKEN, GEEN_BRON_COMMIT)', ['AFGEBROKEN', 'ONDERBROKEN', 'GEEN_BRON_COMMIT'].every((c) => totaal.has(c) && !!UITROL_CODES[c]));
  check('elke vertaling heeft uk én nl (niet leeg, niet gelijk aan de code)', Object.entries(UITROL_CODES).every(([c, t]) => t.uk.trim().length > 3 && t.nl.trim().length > 3 && t.uk !== c && t.nl !== c));
  check('«wat nu» bestaat voor elke weigering wegens het pakket (root)', ['GEEN_AUTEUR', 'GEEN_AGENT', 'GEEN_SAMENVATTING', 'GEEN_BRON_COMMIT', 'INHOUD_ONVEILIG', 'NIET_NIEUWER', 'AFGEBROKEN', 'ONDERBROKEN', 'INSTALLATIE_MISLUKT'].every((c) => uitrolCodeDoen('uk', c).length > 10 && uitrolCodeDoen('nl', c).length > 10));
  // De interface (src/uitrol/fouten.ts) toont nooit meer een kale code voor een code uit de scripts.
  const kaal = [...totaal].filter((c) => codeTekst('uk', c) === c || codeTekst('nl', c) === c);
  check('codeTekst (interface) toont voor geen enkele scriptcode de kale code', kaal.length === 0, kaal.join(', '));
  check('codeTekst: bestaande titels blijven (GOEDGEKEURD → «Схвалено»)', codeTekst('uk', 'GOEDGEKEURD') === 'Схвалено' && codeTekst('nl', 'OK') === 'Klaar');
  check('onbekende code blijft zichtbaar (nooit leeg)', codeTekst('uk', 'IETS_NIEUWS') === 'IETS_NIEUWS' && uitrolCodeTitel('nl', 'X_Y') === 'X_Y' && codeHulp('uk', 'X_Y') === '');
  // Audit 19.10.2026 (A1): HTTP_530 (Cloudflare) is een herstartfout met gewone taal — de banner verdwijnt bij de volgende 200 (AdminUitrolView.laden).
  check('A1: HTTP_530/520/502/504 en NETWORK_ERROR zijn herstartfouten, 500/403 niet', ['HTTP_530', 'HTTP_520', 'HTTP_502', 'HTTP_504', 'NETWORK_ERROR'].every(isHerstart) && !isHerstart('HTTP_500') && !isHerstart('HTTP_403') && !isHerstart(''));
  check('A1: HTTP_530 krijgt menselijke tekst (uk «перезапускається», nl «herstart»), geen «Помилка: HTTP_530»', foutTekst('uk', 'HTTP_530').includes('перезапускається') && !foutTekst('uk', 'HTTP_530').startsWith('Помилка') && foutTekst('nl', 'HTTP_530').includes('herstart') && foutTekst('uk', 'HTTP_502').includes('502'));
  check('A1: melding staat niet meer sticky over de inhoud', !/\.ut-melding\{[^}]*position:sticky/.test(readFileSync('src/uitrol/uitrol.css', 'utf8')));
  return einde();
}
