// LOGIN-001 — broncontroles voor het afgemelde scherm zonder toegang tot echte sessies of sleutels.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

const lees = (pad: string) => readFileSync(join(process.cwd(), pad), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('login-001-weergave');
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
  check('geen fictief merklogo of afbeelding op het aanmeldscherm',
    !inhoud.includes('<img') && !inhoud.includes('mr-login-logo') && !inhoud.includes('<svg'));
  check('Nederlandse en Oekraïense titel en hoofdaanmelding',
    inhoud.includes('Увійдіть у Мій простір') && inhoud.includes('Meld u aan bij Mijn Ruimte')
    && inhoud.includes("'Увійти'") && inhoud.includes("'Aanmelden'"));
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
  check('afgemeld aanmeldvenster gebruikt de goedgekeurde Dark Soft UI, zonder dubbele instellingen',
    menu.includes("data-login-popup={!displayUser ? 'LOGIN-001' : undefined}")
    && menu.includes('mr-login-popup-identity') && menu.includes('mr-login-popup-cta')
    && menu.includes('{displayUser ? (am2 ? controlsV2 : controls) : null}')
    && css.includes(".canonical-account-panel[data-login-popup='LOGIN-001']")
    && css.includes('.mr-login-popup-symbol') && css.includes('background:#f0f0f1!important'));
  check('aanmeldknop bevat geen onafgemaakte tekst',
    menu.includes("firstLogin: 'Обрати спосіб входу'")
    && menu.includes("firstLogin: 'Aanmeldmethode kiezen'")
    && !menu.includes("firstLogin: 'Увійти в обліковий запис через'"));
  const accountCss = lees('src/accountmenu-v2/accountmenu-v2.css');
  check('accountbeheer na aanmelden gebruikt dezelfde Dark Soft UI zonder anonieme modus te raken',
    accountCss.includes("[data-signed-out='false'][data-account-menu-v2='aan']")
    && accountCss.includes('radial-gradient(')
    && accountCss.includes('.canonical-current-account+.canonical-menu-action.primary')
    && accountCss.includes('background:#f0eef0'));
  check('ruimtewissel blijft een echte tweewegknop, thema en taal behouden hun actieve stand',
    accountCss.includes('.am2-ruimte .rw-prive[aria-checked=')
    && accountCss.includes('.am2-seg button.active')
    && accountCss.includes('.am2-ruimte .rw-tech .rw-stand'));
  check('goedkeuring eigenaar: ruimte direct na accountbeheer en voor acties',
    menu.indexOf("data-am2-blok='ruimte'") > menu.indexOf("className='canonical-menu-action primary'")
    && menu.indexOf("data-am2-blok='ruimte'") < menu.indexOf("data-am2-blok='acties'")
    && menu.includes('data-tech-patroon={tech.profiel.band.patroon}'));
  check('site-instellingen verduidelijkt, met behoud van de accountbeheeractie',
    menu.includes("'Налаштування сайту'") && menu.includes("'Site-instellingen'")
    && menu.includes('onSettings();') && menu.includes('onManage();'));
  check('afmelden staat rood onder taal/thema en net voor juridische links',
    menu.indexOf("data-am2-blok='afmelden'") > menu.indexOf('{displayUser ? (am2 ? controlsV2 : controls) : null}')
    && accountCss.includes('.am2-afmelden .logout-current')
    && accountCss.includes('color:#ffadbf'));
  check('technische knop erft de serverkleur met contrasttekst, strepen en stippen',
    menu.includes("tech.catalogus.kleuren[tech.profiel.band.kleur]")
    && accountCss.includes('var(--am2-tech-bg')
    && accountCss.includes('var(--am2-tech-fg')
    && accountCss.includes("[data-tech-patroon='strepen']")
    && accountCss.includes("[data-tech-patroon='stippen']"));
  check('kleine stippen blijven buiten de lettervormen door een effen teksteiland',
    accountCss.includes("[data-tech-patroon='stippen'] .rw-tech :is(.rw-naam,.rw-stand)")
    && accountCss.includes('background:var(--am2-tech-bg')
    && accountCss.includes('box-decoration-break:clone'));
  check('thema staat boven taal, beide met zichtbare verduidelijkende rijtitel',
    menu.indexOf("aria-label={t.theme}", menu.indexOf('const controlsV2')) > menu.indexOf('const controlsV2')
    && menu.indexOf("aria-label={t.theme}", menu.indexOf('const controlsV2')) < menu.indexOf("aria-label={t.language}", menu.indexOf('const controlsV2'))
    && menu.includes('am2-rij-zichtbaar'));
  check('beheerknop is inhoudsbreed in plaats van kaartbreed',
    accountCss.includes('min-height:38px;width:fit-content;max-width:100%;margin:0 auto 6px')
    && !accountCss.includes('min-height:44px;width:100%;margin:0 0 10px'));
  check('sessieacties en taal-/themaknoppen hebben compacte maten',
    accountCss.includes('min-height:36px;width:auto;padding:0 8px')
    && accountCss.includes('height:34px;min-height:34px')
    && accountCss.includes('.am2-rij .language-switch button{min-width:76px'));
  check('ruimtewissel blijft tweedelig maar niet rand-tot-rand',
    accountCss.includes('width:min(330px,100%);margin:0 auto')
    && accountCss.includes('min-height:52px;padding:6px 8px'));
  return einde();
}
