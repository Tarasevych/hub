// STROOK-001 (15.11.2026). Павло: «у вікні перегляду листів є дві опції блоки перегляд та блок з відображенням про зображення, в яких
// немає кнопки сховати, типу закрити хрестиком, треба додати».
// Zonder de wijziging faalt deze test: VertaalStrook en de beeldenstrook hadden geen ✕, er was geen bron van waarheid voor gesloten
// stroken en geen terugknop in de kop. Bewaakt ook dat ✕ alleen verschijnt waar terughalen kan (niet in het voorbeeldvenster),
// en dat sluiten het gedrag niet verandert (beelden blijven verborgen, de taalweergave blijft).
import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { checker } from './hulp/nep-google';

const { check, einde } = checker('stroken-sluiten-20261115');
const lees = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

const modPad = 'src/mail/stroken-sluiten.ts';
check('bron van waarheid src/mail/stroken-sluiten.ts bestaat', existsSync(modPad));

if (existsSync(modPad)) {
  const m = await import('../../src/mail/stroken-sluiten');
  const VertaalStrook = (await import('../../src/mail/VertaalStrook')).default;
  m.herstelStrokenVoorTest();

  // gedrag van de staat
  m.zetStrookGesloten('a', 'taal', true);
  const s1 = renderStaat();
  check('sluiten geldt voor deze brief', s1.a.taal && !s1.a.beelden && !s1.b.taal);
  m.zetStrookGesloten('a', 'beelden', true);
  m.zetStrookGesloten('a', 'taal', false);
  const s2 = renderStaat();
  check('terugzetten van één strook laat de andere dicht', !s2.a.taal && s2.a.beelden);
  m.meldBeeldenStrook('a', 4);
  check('beeldenstrook beschikbaar gemeld (4)', renderStaat().beeldenA === 4);
  m.meldBeeldenStrook('a', 0);
  check('beeldenstrook weg → geen terugknop meer', renderStaat().beeldenA === 0);
  check('zonder messageId gebeurt niets', (() => { m.zetStrookGesloten('', 'taal', true); return !renderStaat().leeg; })());
  m.herstelStrokenVoorTest();

  function renderStaat() {
    // de hook via een kleine component uitlezen (useSyncExternalStore met server-snapshot)
    let uit = { a: { taal: false, beelden: false }, b: { taal: false, beelden: false }, beeldenA: 0, leeg: false };
    const Lezer = () => {
      const s = m.useStroken();
      uit = {
        a: { taal: m.isGesloten(s, 'a', 'taal'), beelden: m.isGesloten(s, 'a', 'beelden') },
        b: { taal: m.isGesloten(s, 'b', 'taal'), beelden: m.isGesloten(s, 'b', 'beelden') },
        beeldenA: s.beelden.get('a') || 0,
        leeg: m.isGesloten(s, '', 'taal'),
      };
      return null;
    };
    renderToString(createElement(Lezer));
    return uit;
  }

  // VertaalStrook: ✕ alleen met onSluit, met een tooltip die het gevolg en de weg terug noemt (uk + nl)
  const props = { modus: 'origineel' as const, bronTaal: 'nl', doelTaal: 'uk', kan: true, bezig: false, onModus: () => {} };
  const zonder = renderToString(createElement(VertaalStrook, { ...props, lang: 'uk' }));
  const metUk = renderToString(createElement(VertaalStrook, { ...props, lang: 'uk', onSluit: () => {} }));
  const metNl = renderToString(createElement(VertaalStrook, { ...props, lang: 'nl', onSluit: () => {} }));
  check('VertaalStrook zonder onSluit: geen ✕', !zonder.includes('data-strook-sluit'));
  check('VertaalStrook met onSluit: ✕ (uk)', metUk.includes('data-strook-sluit="taal"') && metUk.includes('Сховати смугу мови'));
  check('tooltip uk noemt gevolg en weg terug', /поточному вигляді/.test(metUk) && /шапці листа/.test(metUk));
  check('tooltip nl noemt gevolg en weg terug', /huidige weergave/.test(metNl) && /kop van het bericht/.test(metNl));
}

// MailBerichtTekst: beeldenstrook met ✕ alleen als strookSluitbaar; gedrag (toestaan) onveranderd
const tekst = lees('src/MailBerichtTekst.tsx');
check('beeldenstrook krijgt ✕ (data-strook-sluit="beelden")', tekst.includes("data-strook-sluit='beelden'"));
check('✕ alleen met strookSluitbaar', /onSluit=\{sluitbaar\?/.test(tekst));
check('sluiten verandert «toestaan» niet', /const toestaan=instelling==='altijd'\|\|altijdAfzender\|\|eenmaal,/.test(tekst) && !/toestaan=[^;]*isGesloten/.test(tekst));
check('beschikbaarheid gemeld aan de kop', tekst.includes('meldBeeldenStrook(outer.messageId'));

// MailGesprekInhoud: terugknoppen in de kop, vertaalstrook met onSluit, body met strookSluitbaar
const gesprek = lees('src/MailGesprekInhoud.tsx');
// STROOK-002: de terugknoppen zijn één component (src/mail/StrookNazorg.tsx StrookTerugKnop), en «verborgen» komt uit strookStaat
// (✕ voor deze brief of een blijvende regel).
check('terugknop taal in de kop', gesprek.includes("<StrookTerugKnop lang={lang} strook='taal'"));
check('terugknop beelden in de kop', gesprek.includes("<StrookTerugKnop lang={lang} strook='beelden'"));
check('terugknop staat vóór ⓘ', gesprek.indexOf("strook='beelden' regel=") > 0 && gesprek.indexOf("strook='beelden' regel=") < gesprek.indexOf('mail-thread-message-details-trigger'));
check('vertaalstrook verborgen als gesloten', /!taalStaat\(message\)\.verborgen&&<VertaalStrook/.test(gesprek));
check('body in het gesprek is sluitbaar', /<MailMessageBody [^>]*strookSluitbaar/.test(gesprek));

// voorbeeldvenster heeft geen terugknop → daar geen ✕
check('voorbeeldvenster geeft strookSluitbaar niet door', !lees('src/voorbeeld/VoorbeeldVenster.tsx').includes('strookSluitbaar'));

// CSS: alleen variabelen, 44 px op aanraakschermen, mobiele laag aan het eind
const css = lees('src/mail/stroken-sluiten.css');
check('CSS bestaat en wordt geladen', !!css && lees(modPad).includes("import './stroken-sluiten.css'"));
check('geen ruwe kleuren', !/#[0-9a-f]{3,8}\b|rgba?\(\s*\d/i.test(css));
check('44 px op aanraakschermen', /pointer:\s*coarse[\s\S]*width:\s*44px[\s\S]*height:\s*44px/.test(css));
const eersteMedia = css.indexOf('@media');
check('mobiele laag staat aan het eind', eersteMedia > 0 && css.indexOf('\nhtml body', eersteMedia) < 0);

process.exit(einde());
