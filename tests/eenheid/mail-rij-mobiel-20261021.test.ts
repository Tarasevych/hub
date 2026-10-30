// Eenheidstest 21.10.2026 (agent C) — mail op de telefoon (390 px, mail.tarasevych.com/postvak-in), klachten van de eigenaar:
//  1. «У панелі акаунтів пошти фото приплюснуте»: in «Поштові скриньки» was het Google-foto 17,6×40 px (ovaal). Oorzaak: de wrapper
//     droeg de klasse «small» — het globale knop-modificatieklasje uit index.css (`.small{padding:.4rem .7rem}` + mobiel
//     `:is(…,.small){min-height:44px}`): padding 2×11,2 px binnen 40 px breed liet 17,6 px over, en 44 px hoog.
//  2. Snelle acties in de rij: het menu «Інші дії» (⋮) hing ín de rij → de «⋮» van de volgende rijen (z-index 6–9) lagen erboven;
//     op de computer had een voorouder transform:translateY(-50%) → position:fixed rekende vanaf die voorouder (menu op left 2147 px
//     bij een viewport van 1280). Het ongelezen-puntje lag op de telefoon onder de bovenrand van de altijd zichtbare «⋮».
//     Veegknoppen 3×72 px: «Непрочитано» (78 px) paste niet.
//  3. Naam en adres van de afzender werden gelijk afgekapt («anastasia-ar… notificati…»); in de minimale rij werd de tijd («09…»)
//     en het schild afgeknipt en nam het «oog» (36 px) de plaats van de datum in.
// Elke controle legt de regel vast die het oplost; de metingen ДО/ПІСЛЯ komen uit de stand (tests/e2e/hulp/stand-mail-nep.ts).
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');
const zc = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const HEX = /#[0-9a-fA-F]{3,8}\b/;

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-rij-mobiel-20261021');

  // ------------------------------------------------------------------ 1. avatars
  const index = zc(lees('src/index.css'));
  check('1 index.css: .small alleen op knoppen/links (:where → zelfde specificiteit 0,1,0)', index.includes(':where(button,a,label,[role=button],input,select,summary).small { min-height:2.1rem; padding:.4rem .7rem; font-size:.76rem; }') && !/(^|[}\s])\.small\s*\{/.test(index));
  check('1 index.css (mobiel): tikhoogte van de oude knopklassen alleen op interactieve elementen', index.includes(':is(.primary,.secondary,.ghost,.success,.warning,.footer-button,.small):where(button,a,label,[role=button],input,select,summary){min-height:var(--tik-hoogte)}'));
  // nabootsing van de oude toestand: 40 px brede wrapper met de oude .small-padding (0,7 rem × 16 px aan elke kant)
  const oudeBreedte = 40 - 2 * 0.7 * 16;
  check('1 nabootsing ДО: padding van .small liet 17,6 px van 40 over (het gemeten 17,625×40)', Math.abs(oudeBreedte - 17.6) < 0.01, String(oudeBreedte));
  const prim = zc(lees('src/ontwerp/primitieven.css'));
  check('1 primitieven.css: één regel voor alle foto-avatars (img.avatar-img: flex:none, aspect-ratio:1, object-fit:cover)', /img\.avatar-img \{ flex:none; aspect-ratio:1; object-fit:cover; object-position:center; \}/.test(prim));
  check('1 StableAvatar zet class avatar-img op het <img>', lees('src/StabielAvatar.tsx').includes("<img className='avatar-img' src={display}"));
  const badge = lees('src/MailAccountBadge.tsx'), badgeCss = zc(lees('src/mail-account-badge.css'));
  check('1 MailAccountBadge: geen klasse «small» meer op het foto (is-klein); initialen in een eigen span', !/mail-account-badge-photo small/.test(badge) && (badge.match(/mail-account-badge-photo is-klein/g) || []).length === 2 && badge.includes('fallback={<span className="mail-account-badge-initial">{initialsOf(a)}</span>}'));
  check('1 mail-account-badge.css: foto in het menu 40×40, niet krimpbaar, padding 0, aspect-ratio 1', /\.mail-account-badge-photo\.is-klein\{position:relative;flex:none;width:40px;height:40px;min-width:40px;min-height:40px;max-width:40px;max-height:40px;padding:0;/.test(badgeCss) && /\.mail-account-badge-photo\.is-klein>img,\.mail-account-badge-initial\{[^}]*aspect-ratio:1;padding:0;border-radius:50%/.test(badgeCss));
  check('1 mail-account-badge.css: alleen tokens (geen hex), geen letters < 12 px', !HEX.test(badgeCss) && !/font-size:(?:\.[0-7]\d*rem|(?:[0-9]|1[01])px)/.test(badgeCss));

  // ------------------------------------------------------------------ 2. menu «Інші дії» (⋮)
  const qa = lees('src/MailRijSnelleActies.tsx'), qaCss = zc(lees('src/mail-rij-snelle-acties.css'));
  check('2 menu is een portaal in <body> (niet meer in de rij)', qa.includes("import{createPortal}from'react-dom'") && qa.includes("{open&&createPortal(<div ref={popRef} className='mail-row-action-popover' role='menu'") && qa.includes('</div>,document.body)}'));
  check('2 klik buiten: ook een klik ín het portaalmenu telt als «binnen» (anders sloot het menu vóór de actie)', qa.includes('if(!root.current?.contains(target)&&!popRef.current?.contains(target))setOpen(false)'));
  check('2 gebeurtenissen uit het menu borrelen niet via de React-boom naar de rij (tap opent de brief niet)', /onClick=\{keepInMenu\} onPointerDown=\{keepInMenu\} onPointerUp=\{keepInMenu\}/.test(qa) && qa.includes('const keepInMenu=(event:SyntheticEvent)=>{event.stopPropagation()}'));
  check('2 plaatsing: altijd fixed naast de «⋮», breedte ≤ 320 px (telefoon) / 288 px, binnen het scherm; herberekend bij scrollen/resize; dicht als de «⋮» uit beeld gaat', qa.includes('const width=Math.round(Math.min(mobile?320:288,vw-pad*2))') && qa.includes('left=Math.min(Math.max(pad,rect.right-width),vw-width-pad)') && qa.includes("window.addEventListener('scroll',scroll,true)") && qa.includes('if(rect.bottom<minTop||rect.top>vh-pad||rect.width===0){setOpen(false);return}'));
  check('2 toetsenbord: pijlen/Home/End binnen het menu, Escape en Tab terug naar «⋮», Enter op «⋮» focust het eerste item', qa.includes("event.key==='ArrowDown'||event.key==='ArrowUp'") && qa.includes("else if(event.key==='Tab'){setOpen(false);moreRef.current?.focus()}") && qa.includes('focusFirst.current=event.detail===0'));
  check('2 CSS: position:fixed, z-index boven rijen/panelen (660 > 640 van het postvakkenmenu), geen rij-gebonden plaatsing meer', /\.mail-row-action-popover\{position:fixed;z-index:660;/.test(qaCss) && !qaCss.includes('.google-mail-row .mail-row-action-popover') && !qaCss.includes('.google-mail-row:has(.mail-row-action-popover)'));
  const mobielMail = zc(lees('src/mail-mobiel.css'));
  check('2 mail-mobiel.css: geen oude (nu dode) popover-regels met !important en rgba-schaduw', !mobielMail.includes('.mail-row-action-popover'));
  check('2 punten gelijk: 52 px (computer) / 56 px (telefoon, sterker dan het fundament 0,3,1); tekst max. 2 regels; volledige tekst in title', /\.mail-row-action-menu-item\{[^}]*min-height:52px;/.test(qaCss) && qaCss.includes('.mail-row-action-popover[role=menu] .mail-row-action-menu-item[role=menuitem]{min-height:56px;') && /\.mail-row-action-menu-item>span:last-child\{[^}]*-webkit-line-clamp:2;/.test(qaCss) && (qa.match(/title=\{labels\[id\]\}/g) || []).length === 2);
  check('2 letters in het menu ≥ 12 px (was 12 px en 9 px voor de kleur-uitleg)', !/font-size:(?:[0-9]|1[01])px/.test(qaCss) && qaCss.includes('.mail-row-color-action small{color:var(--muted);font-size:var(--tekst-mini)'));
  check('2 tooltip van «⋮» verborgen zolang het menu open is', qaCss.includes(".mail-row-hover-actions .mail-row-actions-overflow>.mail-row-actions-more[aria-expanded=true]>span[role=tooltip]{opacity:0;visibility:hidden}") && !qaCss.includes("!important"));
  check('2 mail-rij-snelle-acties.css: geen hex', !HEX.test(qaCss));
  // ongelezen-puntje: telefoon — bovenste regel, gecentreerd boven de «⋮» (44×44 rechtsonder, right 4 px)
  const punt = /\.google-mail-row\.mail-row-semantic-order>\.mail-row-unread-dot\{top:18px;margin-top:0;right:22px\}/.test(mobielMail);
  check('2 puntje «ongelezen» op de telefoon in de bovenste regel (top 18 px), gecentreerd boven de «⋮» (right 22 = 4 + 22 − 4)', punt);
  // nabootsing: rij van 92 px, «⋮» 44 px op bottom 4 → top 44; oud puntje top 50 % − 4 = 42…50 → overlapt; nieuw 18…26 < 28 (laagste rij 76 px)
  const overlap = (dotTop: number, rijH: number) => { const meerTop = rijH - 4 - 44; return dotTop + 8 > meerTop; };
  check('2 nabootsing: ДО overlapt (rij 92 px), ПІСЛЯ in geen enkele rijhoogte ≥ 76 px', overlap(92 / 2 - 4, 92) && [76, 92, 119, 140].every((h) => !overlap(18, h)));
  // blok 1 (25.10.2026): de kleur van een veegknop komt uit de toon van de actie (--actie-vlak, src/mail/mail-acties.css) — archief blauw
  // zoals overal (was --accent), verwijderen rood; geen eigen kleur per klasse meer.
  check('2 veegknoppen: 3 × 84 px (SWIPE_W 252 = CSS-breedte), tekst mag afbreken, tokenkleuren uit de toon van de actie', lees('src/MailBerichtRij.tsx').includes('SWIPE_W=252,') && mobielMail.includes('.mail-row-swipe-actions{position:absolute;top:0;right:0;bottom:0;width:252px;') && mobielMail.includes('.mail-row-swipe-actions button>span{max-width:100%;text-align:center;white-space:normal;overflow-wrap:break-word}') && mobielMail.includes('background:var(--actie-vlak,var(--accent));color:var(--actie-op-vlak,var(--text-on-accent));') && !/\.mail-row-swipe-actions \.(archive|read|trash)\{background/.test(mobielMail));
  check('2 mail-mobiel.css: geen hex in nieuwe regels (alleen fallbacks var(--x,#…) toegestaan)', !HEX.test(mobielMail.replace(/var\(--[a-z0-9-]+,#[0-9a-fA-F]{3,8}\)/g, '')));

  // ------------------------------------------------------------------ 3. naam > adres, compact schild/oog
  const afz = zc(lees('src/afzenders/afzenders.css'));
  check('3 grid-indeling: naamkolom groeit eerst (max-content), adres+schild krijgen de rest (fr, min 22 px)', afz.includes(".mail-row-sender-copy:not([data-layout='inline']):has(> .afz-groep) { grid-template-columns: minmax(0, max-content) minmax(22px, 1fr);"));
  check('3 flex-indeling: groep «adres + schild» krimpt eerst (flex-shrink 1000), schild nooit', afz.includes(".mail-row-sender-copy[data-layout='inline'] > .afz-groep, .mail-minimum-sender > .afz-groep { align-self: center; flex: 0 1000 auto; min-width: 22px; }") && afz.includes('.afz-groep > .afz-badge { flex: none; }'));
  check('3 adres nooit kleiner dan 12 px', afz.includes('font-size: max(var(--tekst-mini), .86em);'));
  check('3 telefoon (normale rij): afzender als flex, naam krimpt pas na de adresgroep; oog 28 px met tikvlak ::after; datum krimpt niet', mobielMail.includes('.mail-row-sender-copy>.afz-groep{flex:0 1000 auto;min-width:22px}') && mobielMail.includes(".voorbeeld-knop{position:relative;width:28px;height:28px;margin:0}") && mobielMail.includes('.voorbeeld-knop::after{content:\'\';position:absolute;inset:-8px}') && mobielMail.includes("[data-mail-density-block='date']{display:flex;align-items:center;gap:2px;flex:none;min-width:max-content}"));
  const mini = lees('src/MailMinimumBerichtRij.tsx'), miniCss = zc(lees('src/mail-minimum-rij.css'));
  check('3 minimale rij: breedte via CSS-variabele (inline max-width won van elke mobiele regel)', !mini.includes('maxWidth:`min(${p.profile.senderWidth}px,32vw)`') && mini.includes("style={{'--mail-minimum-sender-max':`${p.profile.senderWidth}px`}as CSSProperties}") && miniCss.includes('.mail-minimum-sender{max-width:min(var(--mail-minimum-sender-max,var(--mail-density-sender-width,112px)),32vw)}'));
  check('3 minimale rij (telefoon): afzender krimpt niet onder zijn tekst (≤ 38vw), schild flex:none, tijd niet afgekapt, oog 24 px', miniCss.includes('.mail-row-minimum .mail-minimum-sender{flex:0 0 auto;min-width:72px;max-width:min(var(--mail-minimum-sender-max,var(--mail-density-sender-width,112px)),38vw)}') && miniCss.includes('.mail-row-minimum .mail-minimum-sender>.afz-groep{flex:none;max-width:none}') && miniCss.includes('.mail-minimum-date:not(.full){flex:none;min-width:max-content;max-width:none}') && miniCss.includes('.mail-row-minimum .mail-minimum-date .voorbeeld-knop{position:relative;width:24px;height:24px;margin:0}'));

  // ------------------------------------------------------------------ 4. bijlagen in de rij + kleine letters (stand: contrast 24 → 0, kleine-letter 61 → 0)
  const ws = zc(lees('src/google-mail-werkruimte.css')), strip = zc(lees('src/mail-bijlage-strook.css'));
  check('4 kleuren van bijlagetypes uit tokens (geen hex: #177b69 gaf 2,43:1 in donker, 4,38:1 in licht)', ['image', 'calendar', 'contact', 'signature', 'archive', 'document', 'sheet', 'presentation', 'audio', 'video', 'text'].every((k) => new RegExp(`\\.mail-attachment-${k}\\{color:var\\(--(ok|info|warn|fout|accent)\\)\\}`).test(ws)));
  check('4 typelabel en tweede regel van de rij ≥ 12 px (ook bij een dichtheidsprofiel van 10–11 px)', ws.includes('.mail-attachment-icon b{font-size:var(--tekst-mini);') && ws.includes('.google-mail-workspace .mail-row-sender-copy>small{font-size:max(var(--tekst-mini),var(--mail-density-sender-email-size,12px))}') && ws.includes('.google-mail-workspace .mail-row-copy>small,.google-mail-workspace .mail-row-snippet-block>small{font-size:max(var(--tekst-mini),var(--mail-density-snippet-size,12px))}'));
  check('4 labels van bijlagen in de rij ≥ 12 px met (0,3,3); tekst op de miniatuur in tokenkleur', strip.includes('html body .google-mail-workspace .google-mail-row :is(.mail-attachment-icon b,.mail-attachment-name small,.mail-attachment-preview-card .mail-attachment-name strong,.mail-attachment-compact-size,.mail-attachment-miniature-paper>b,.mail-attachment-size-badge){font-size:var(--tekst-mini)}') && strip.includes('.mail-attachment-name strong{font-size:9.5px;line-height:1.15;color:var(--text-on-donker)}'));

  // ------------------------------------------------------------------ stand: de stappen bestaan
  const stand = lees('tests/e2e/stand-knipsels-20261020.ts'), nep = lees('tests/e2e/hulp/stand-mail-nep.ts');
  check('stand: stappen mail-agc-lijst, -lijst-minimum, -menu, -postvakken; nagebootste pariteit zonder netwerk naar buiten', ['mail-agc-lijst', 'mail-agc-lijst-minimum', 'mail-agc-menu', 'mail-agc-postvakken'].every((n) => stand.includes(`S('${n}'`)) && nep.includes("page.route('**/api/owner/mail/google-suite/messages'") && !/https?:\/\/(?!\*\*)[a-z]/i.test(nep.replace(/https:\/\/[^'"`\s]*example\.test/g, '')));
  check('stand: menu-controle meet elementFromPoint in drie punten per item (rechts ligt boven de «⋮» van volgende rijen)', nep.includes('[r.left + 12, r.left + r.width / 2, r.right - 12].map((x) => document.elementFromPoint(x, r.top + r.height / 2))'));

  return einde();
}
