// LOGIN-001 — broncontroles voor het afgemelde scherm zonder toegang tot echte sessies of sleutels.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

const lees = (pad: string) => readFileSync(join(process.cwd(), pad), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('aanmeld-001-weergave');
  const schil = lees('src/CanoniekOmlijsting.tsx');
  const van = schil.indexOf('export function SignedOutCenter(');
  const tot = schil.indexOf('export default function CanonicalChrome(', van);
  const inhoud = schil.slice(van, tot);
  const menu = lees('src/CanoniekAccountMenu.tsx');
  const hub = lees('src/App.tsx');
  const diensten = lees('src/VerenigdDienstApp.tsx');
  const css = lees('src/aanmeld-herontwerp.css');

  check('SignedOutCenter blijft in de gemeenschappelijke schil en wordt door beide apps gebruikt',
    van >= 0 && tot > van && hub.includes('<SignedOutCenter') && diensten.includes('<SignedOutCenter'));
  // INTEG-001 (03.11.2026): de eigenaar vroeg expliciet «Увійти через Google» met het merklogo van Google. Daarom staat er nu
  // precies ÉÉN afbeelding: het officiële Google-«G» uit src/merk/google-g-officieel.ts (letterlijk uit @iconify-json/logos, CC0;
  // tests/eenheid/aanmelden-integ-20261103 vergelijkt het met het pakket). Nog steeds geen verzonnen logo (mr-login-logo) en geen
  // zelfgetekende <svg>.
  check('geen fictief merklogo: alleen het officiële Google-«G» als enige afbeelding',
    (inhoud.match(/<img/g) || []).length === 1 && inhoud.includes('src={GOOGLE_G_DATA_URI}') && schil.includes("from './merk/google-g-officieel'")
    && !inhoud.includes('mr-login-logo') && !inhoud.includes('<svg'));
  // INTEG-001: geen algemene «Увійти»/«Aanmelden» meer — de knop zegt meteen hoe (wens van de eigenaar).
  check('Nederlandse en Oekraïense titel en hoofdaanmelding («Увійти через Google» / «Aanmelden met Google»)',
    inhoud.includes('Увійдіть у Мій простір') && inhoud.includes('Meld u aan bij Mijn Ruimte')
    && inhoud.includes("'Увійти через Google'") && inhoud.includes("'Aanmelden met Google'"));
  check('de echte bestaande aanmeldfunctie blijft het enige ingangspunt',
    inhoud.includes('onOpenAccount()') && !inhoud.includes('/api/owner/session') && !inhoud.includes('startPrimaryRedirectLogin'));
  check('opgeslagen account is optioneel en wordt niet verzonnen',
    inhoud.includes('rememberBrowser&&preferredAccount') && inhoud.includes('preferredAccount?.name')
    && hub.includes('preferredAccount={knownAccounts[0]?.user}')
    && (diensten.match(/preferredAccount=\{knownAccounts\[0\]\?\.user\}/g) || []).length === 2);
  check('bewaren van account blijft een beheerbare checkbox',
    inhoud.includes("type='checkbox'") && inhoud.includes('onRememberBrowser(event.target.checked)'));
  check('juridische links blijven in beide talen',
    inhoud.includes("'/privacy#nl'") && inhoud.includes("'/privacy'") && inhoud.includes("'/terms#nl'"));
  check('taal en thema verschijnen als kleine knoppen, niet als een groot paneel',
    menu.includes('mr-sign-in-quick-controls') && menu.includes("onLanguage(lang === 'uk' ? 'nl' : 'uk')")
    && menu.includes('theme === \'plum-dark\'') && css.includes('.mr-sign-in-quick-controls button{width:38px;height:38px'));
  check('quick controls bestaan uitsluitend in de afgemelde visuele weergave',
    css.includes('.mr-sign-in-quick-controls{display:none') && css.includes(':has(.mr-sign-in) .mr-sign-in-quick-controls{display:flex'));
  check('knoprand is exact 1px en beweegt alleen na interactie',
    css.includes('border:1px solid') && css.includes('conic-gradient(from var(--mr-ring-angle)')
    && css.includes('[data-activated=\'true\']') && css.includes('@keyframes mr-login-ring'));
  check('geen automatische toegang: browsercallback blijft verantwoordelijk voor login',
    inhoud.includes('onClick={open}') && !inhoud.includes('onTheme('));
  check('mobiele en bewegingsarme weergave aanwezig',
    css.includes('@media(max-width:700px)') && css.includes('@media(prefers-reduced-motion:reduce)'));
  check('alle bestaande themavarianten blijven ondersteund',
    css.includes('theme-dark') && css.includes('theme-plum-dark') && css.includes('theme-plum-light'));
  return einde();
}
