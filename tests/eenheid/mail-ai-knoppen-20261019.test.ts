// Punt 14 van de eigenaarslijst (19.10.2026): «ШІ-кнопки в листі стирчать окремо … вилазять і перекривають, замість того щоб
// вбудуватися в наявний ряд кнопок дій, і не мають іконки».
//
// Elke check reproduceert eerst het oude probleem en bewijst dan dat het weg is:
//  1. LAY-OUT (de echte oorzaak van het overlappen): `.google-mail-reader` is een raster met `grid-template-rows:auto
//     minmax(0,1fr)` (kop + scrollende inhoud) en <MailReaderAi> is het DERDE kind. De balk pakte dus de flexibele rij en de
//     brief belandde in een impliciete rij buiten `overflow:hidden`. Bovendien matchte `<section class="mra">` de regel
//     `.google-mail-reader>section{overflow:auto;padding:24px}`, bedoeld voor de inhoud.
//  2. GEOMETRIE: de balk had eigen maten (min-height 30 px, padding 2px 11px, font-size .8rem) naast de actierij
//     (.mail-reader-action-button: 44 px, 999 px, 11 px) → een kleine knop «ШІ» in een eigen kadertje. Nu draagt elke knop van
//     de balk diezelfde klasse en herhaalt mail-lezer-ai.css die maten nooit.
//  3. ICOON: elke knop van de balk heeft een eigen lucide-icoon en een tooltip.
//  4. SMAL SCHERM: wikkelen in plaats van overlappen, aanraakdoelen ≥ 44 px, niets absoluut gepositioneerd in de balk.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { checker } from './hulp/nep-google';

const W = process.cwd();
const lees = (p: string) => readFileSync(join(W, p), 'utf8');
/** Alle declaraties van één CSS-selector (eerste voorkomen), zonder spaties. */
const regelVan = (css: string, selector: string) => {
  const i = css.indexOf(selector);
  if (i < 0) return '';
  const start = css.indexOf('{', i);
  const eind = css.indexOf('}', start);
  return start < 0 || eind < 0 ? '' : css.slice(start + 1, eind).replace(/\s+/g, '');
};

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-ai-knoppen-20261019');
  const tsx = lees('src/MailLezerAi.tsx');
  const css = lees('src/mail-lezer-ai.css');
  const werkbalkCss = lees('src/mail-lezer-werkbalk.css');
  const mobiel = lees('src/mail-mobiel-passend.css');
  const werkruimte = lees('src/GoogleMailWerkruimte.tsx');

  // ---------------------------------------------------------------- 1. lay-out: niets overlapt meer
  {
    // Pakket 3 «Adaptive Mail Canvas» (24.10.2026): de balk staat niet meer als eigen rij in de lezer, maar in de antwoordregel van het
    // gesprek (макет: «рядок відповіді: Усім, Переслати, підказки ШІ (пунктир), тон»); de regels hieronder voor een eigen rij blijven geldig.
    check('14/1 (pakket 3): de balk is geen eigen kind van .google-mail-reader meer — hij staat in de antwoordregel (vorm «antwoord»)',
      !/<MailReaderAi/.test(werkruimte) && /<MailReaderAi vorm='antwoord'/.test(lees('src/MailGesprekInhoud.tsx')) && /grid-template-rows:auto minmax\(0,1fr\)/.test(lees('src/google-mail-werkruimte.css')));
    check('14/1 opgelost: zodra de balk er is, heeft de lezer DRIE rijen (kop, balk, inhoud) — de brief houdt de flexibele rij',
      /\.google-mail-reader:has\(> \.mra\)\{grid-template-rows:auto auto minmax\(0,1fr\)\}/.test(css));
    check('14/1 opgelost: de balk erft de inhoudsregel .google-mail-reader>section niet meer (geen padding 24px, geen eigen scroll)',
      /\.google-mail-reader > section\.mra\{[^}]*overflow:visible/.test(css));
    check('14/1 tijdens het laden (geen balk) blijft het raster ongewijzigd: de regel staat achter :has(> .mra)',
      css.includes(':has(> .mra)') && !/\.google-mail-reader\{grid-template-rows/.test(css));
    check('14/1 niets in de balk is absoluut/vast gepositioneerd (alleen de verborgen schermlezertekst)',
      (css.match(/position:(absolute|fixed|sticky)/g) || []).length === 1 && /\.mra-sr\{position:absolute/.test(css));
  }

  // ---------------------------------------------------------------- 2. dezelfde geometrie als de rest van de actierij
  {
    const rij = regelVan(werkbalkCss, '.mail-reader-action-button{');
    // 20.10.2026 ontwerpfundament: nergens tekst < 12 px (was 11 px).
    check('14/2 de actierij van de lezer heeft maat 44 px, vorm 999 px, tekst 12 px / 700', rij.includes('min-height:44px') && rij.includes('min-width:44px') && rij.includes('border-radius:999px') && rij.includes('font-size:12px') && rij.includes('font-weight:700'), rij.slice(0, 120));
    const knoppen = [...tsx.matchAll(/<button[^>]*className="([^"]*)"/g)].map((m) => m[1]);
    const balkKnoppen = knoppen.filter((c) => !c.includes('mra-icon') && !c.includes('mra-primary') && !/^$/.test(c));
    check('14/2 opgelost: ELKE knop van de balk draagt mail-reader-action-button (dus per definitie dezelfde maten)',
      balkKnoppen.length >= 3 && balkKnoppen.every((c) => c.includes('mail-reader-action-button')), balkKnoppen.join(' | '));
    // Elke regel die .mra-bar-knoppen raakt, mag géén maat zetten; de oude eigen maten (30 px / 2px 11px / .8rem) zijn weg.
    const balkRegels = [...css.matchAll(/([^{}\n]*\.mra-bar[^{}\n]*)\{([^}]*)\}/g)].filter((m) => /button|>\s*\*/.test(m[1]));
    check('14/2 reproductie weg: mail-lezer-ai.css zet voor de knoppen van de balk GEEN eigen hoogte/padding/vorm/lettergrootte meer',
      balkRegels.length > 0 && balkRegels.every((m) => !/(min-height|padding|border-radius|font-size)/.test(m[2]))
      && !/\.mra-(bar|toggle)[^{}\n]*\{[^}]*min-height:30px/.test(css) && !/\.mra-(bar|toggle)[^{}\n]*\{[^}]*font-size:\.8rem/.test(css),
      balkRegels.map((m) => m[1].trim()).join(' | '));
    check('14/2 keuze en tekstveld in de rij zijn even hoog als de knoppen (44 px) en even rond (999 px)',
      regelVan(css, '.mra-veld{').includes('min-height:44px') && regelVan(css, '.mra-veld{').includes('border-radius:999px'));
    check('14/2 de rij heeft dezelfde tussenruimte als .mail-reader-action-items (4 px) en wikkelt',
      regelVan(css, '.mra-bar{').includes('gap:4px') && regelVan(werkbalkCss, '.mail-reader-action-items{').includes('gap:4px') && regelVan(css, '.mra-bar{').includes('flex-wrap:wrap'));
    check('14/2 eigen kleur van «ШІ» verandert alleen kleur/rand, nooit de maat',
      /\.mra-toggle\{color:var\(--warn\);border-color:[^}]*\}/.test(css) /* 20.10: token i.p.v. #c2603d */ && !/\.mra-toggle\{[^}]*(min-height|padding:)/.test(css));
  }

  // ---------------------------------------------------------------- 3. iconen en uitleg
  {
    check('14/3 reproductie weg: elke knop van de balk heeft een lucide-icoon (Sparkles, TextQuote, CornerUpLeft) plus een tekstlabel',
      /<Sparkles aria-hidden="true" \/><span>/.test(tsx) && /<TextQuote aria-hidden="true" \/>/.test(tsx) && /<CornerUpLeft aria-hidden="true" \/>/.test(tsx)
      && tsx.includes("from 'lucide-react'"));
    check('14/3 ook de velden in de rij hebben een icoon (Gauge voor de toon, PenLine voor de wens)', /<Gauge aria-hidden="true" \/>/.test(tsx) && /<PenLine aria-hidden="true" \/>/.test(tsx));
    check('14/3 iconen hebben een vaste maat uit de gezamenlijke regel (17 px) — geen standaard 24 px die de rij oprekt',
      regelVan(werkbalkCss, '.mail-reader-action-button svg,.mail-reader-action-preview svg{').includes('width:17px') && regelVan(css, '.mra-veld > svg{').includes('width:17px'));
    check('14/3 elke knop van de balk heeft een tooltip (title) en «ШІ» ook aria-pressed', (tsx.match(/title=\{(uitleg|t\()/g) || []).length >= 3 && tsx.includes('aria-pressed={open}'));
  }

  // ---------------------------------------------------------------- 4. smal scherm
  {
    check('14/4 de rij wikkelt en blijft binnen het scherm (ook ≥ 721 px: géén horizontale scroll die knoppen wegduwt)',
      /html body \.mra-bar\{flex-wrap:wrap;min-width:0;max-width:100%\}/.test(mobiel) && /html body \.google-mail-reader > section\.mra\{min-width:0;max-width:100%/.test(mobiel));
    check('14/4 ≤ 430 px: alleen iconen, elk doel 44 × 44 px, «ШІ» houdt zijn tekst', /max-width:430px/.test(mobiel)
      && /html body \.mra-bar > button:not\(\.mra-toggle\)\{width:44px/.test(mobiel) && /button:not\(\.mra-toggle\) > span\{position:absolute/.test(mobiel));
    check('14/4 ≤ 720 px: het tekstveld krijgt een eigen regel in plaats van de knoppen weg te drukken', /html body \.mra-veld-breed\{flex:1 1 100%\}/.test(mobiel));
  }

  // ---------------------------------------------------------------- 5. uitvoer (react-dom/server)
  {
    const html = renderToString(createElement((await import('../../src/MailLezerAi')).default, {
      lang: 'uk' as const,
      context: { service: 'mail', tabContext: 'test', sourceOrigin: 'https://mail.tarasevych.com' } as never,
      messages: [{ from: 'Jan <jan@peeters.be>', receivedAt: Date.parse('2026-10-19T10:00:00Z'), plainText: 'Goedemiddag, hierbij de factuur.' }],
      onUseReply: () => undefined,
    }));
    check('14/5 uitvoer: «ШІ» staat in de actierij-klasse, met icoon (<svg>) en aria-pressed', /class="mail-reader-action-button mra-toggle"/.test(html) && /<svg/.test(html) && /aria-pressed="false"/.test(html), html.slice(0, 200));
    check('14/5 uitvoer: de balk is een werkbalk (role=toolbar) binnen <section class="mra">, zonder eigen laag (geen style met z-index)',
      /class="mra"/.test(html) && /role="toolbar"/.test(html) && !/z-index/.test(html));
    check('14/5 uitvoer: geen «undefined»/«NaN», en de nl-variant werkt ook', !/undefined|NaN/.test(html)
      && renderToString(createElement((await import('../../src/MailLezerAi')).default, { lang: 'nl' as const, context: {} as never, messages: [], onUseReply: () => undefined })).includes('>AI<'));
  }

  return einde();
}
