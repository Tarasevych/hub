// Accountmenu v2 (UI-008, vlag accountmenu-v2): vlag, migratie, tooltiptekst, poort (zonder vlag het oude menu) en vlaggen-stijl.
import { readFileSync } from 'node:fs';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import { ACCOUNTMENU_V2_VLAG, avatarTip } from '../../src/accountmenu-v2/vlag';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('accountmenu-v2-20261029');
  const u = VLAG_UITLEG[ACCOUNTMENU_V2_VLAG];
  check('vlag: uitleg in uk en nl', !!u && u.naam.length === 2 && u.wat.every(Boolean) && u.gevolg.every(Boolean));
  const mig = readFileSync('migrations/0141_accountmenu_v2_vlag.sql', 'utf8');
  check('migratie 0141: standaard UIT, idempotent', /'accountmenu-v2'/.test(mig) && /false,\s*false/.test(mig) && /ON CONFLICT \(sleutel\) DO NOTHING/.test(mig));
  check('tip: naam + e-mail', avatarTip('uk', 'Pavlo', 'p@x.org', 0) === 'Pavlo\np@x.org');
  check('tip: naam gelijk aan e-mail → één regel', avatarTip('nl', 'p@x.org', 'p@x.org', 0) === 'p@x.org');
  check('tip: andere accounts uk', avatarTip('uk', 'Pavlo', 'p@x.org', 2).endsWith('Ще акаунтів: 2 — натисніть, щоб перемкнутися'));
  check('tip: andere accounts nl', avatarTip('nl', 'Pavlo', 'p@x.org', 1).includes('Nog 1 account(s)'));
  const menu = readFileSync('src/CanoniekAccountMenu.tsx', 'utf8');
  check('poort: v2-delen alleen met am2', /\{am2 \? controlsV2 : controls\}/.test(menu) && /\{am2 \? \(\n\s+<>\n\s+<div className='am2-blok am2-acties'/.test(menu));
  check('poort: oude CSS-vlaggen in het oude menu behouden', /compact-flag flag-uk/.test(menu) && /compact-flag flag-nl/.test(menu));
  check('vlaggen: echte emoji in v2', menu.includes('🇺🇦') && menu.includes('🇳🇱'));
  const css = readFileSync('src/accountmenu-v2/accountmenu-v2.css', 'utf8');
  check('css: alles onder [data-account-menu-v2] (behalve hulpklasse)', css.split('}').map((r) => r.trim()).filter((r) => r && !r.startsWith('/*') && !r.startsWith('@media') && !r.startsWith('.am2-verborgen')).every((r) => r.replace(/\/\*[\s\S]*?\*\//g, '').trim().startsWith('[data-account-menu-v2]') || !r.includes('{')));
  check('css: vlaggen krijgen geen filter/grayscale', /\.am2-vlag\{[^}]*filter:none!important/.test(css) && !/am2-vlag[^{]*\{[^}]*grayscale/.test(css));
  check('css: geen position:fixed (plaatsing-controle)', !/position:\s*fixed/.test(css));
  check('beveiliging: RuimteWissel/tech-opslag niet gewijzigd door v2 (alleen compact-prop gebruikt)', /<RuimteWissel taal=\{lang === 'uk' \? 'uk' : 'nl'\} compact \/>/.test(menu));
  return einde();
}
