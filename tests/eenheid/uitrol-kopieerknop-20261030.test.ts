// Hoofd3: kopieerknop in «Що змінено» (klembord + terugval), opmaak (klein, klikvlak ≥44px, rechtsboven) en de concrete
// uitleg bij «niet nieuwer» (versie pakket, actieve versie, bron).
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { kopieerNaarKlembord } from '../../src/uitrol/kopieer';
import { nietNieuwerUitleg } from '../../src/uitrol/versie-uitleg';
import KopieerBlokKnop from '../../src/uitrol/KopieerBlokKnop';
import { checker } from './hulp/nep-google';

function nepDocument(execOk: boolean) {
  const log: string[] = []; const body = { kids: [] as unknown[], appendChild(n: unknown) { this.kids.push(n); }, removeChild(n: unknown) { this.kids = this.kids.filter((k) => k !== n); } };
  const doc = { body, createElement: () => ({ value: '', style: {}, setAttribute() {}, select() { log.push('select'); } }), execCommand: (c: string) => { log.push(c); return execOk; } };
  return { doc: doc as unknown as Document, log, body };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-kopieerknop');
  let geschreven = '';
  check('clipboard in veilige context', await kopieerNaarKlembord('abc', { clipboard: { writeText: async (t) => { geschreven = t; } }, document: null, veilig: true }) && geschreven === 'abc');
  const a = nepDocument(true);
  check('clipboard faalt → terugval execCommand', await kopieerNaarKlembord('x', { clipboard: { writeText: async () => { throw new Error('nee'); } }, document: a.doc, veilig: true }) && a.log.join() === 'select,copy' && a.body.kids.length === 0);
  const b = nepDocument(true);
  check('niet-HTTPS → direct execCommand, clipboard niet gebruikt', await kopieerNaarKlembord('x', { clipboard: { writeText: async () => { throw new Error('mag niet'); } }, document: b.doc, veilig: false }) && b.log.includes('copy'));
  const c = nepDocument(false);
  check('alles faalt → false (geen vals «Скопійовано»)', !(await kopieerNaarKlembord('x', { clipboard: null, document: c.doc, veilig: false })));
  check('lege tekst → false', !(await kopieerNaarKlembord('', { clipboard: { writeText: async () => {} }, document: null, veilig: true })));

  const ref = { current: null };
  const uk = renderToStaticMarkup(createElement(KopieerBlokKnop, { lang: 'uk', blok: ref }));
  const nl = renderToStaticMarkup(createElement(KopieerBlokKnop, { lang: 'nl', blok: ref }));
  check('aria-label uk', uk.includes('aria-label="Копіювати текст блоку"'));
  check('aria-label nl', nl.includes('aria-label="Tekst van het blok kopiëren"'));
  check('pictogram, geen tekstknop', /<button[^>]*><svg/.test(uk) && uk.includes('role="status"'));
  check('teksten bevestiging tweetalig in de bron', /Скопійовано/.test(readFileSync('src/uitrol/KopieerBlokKnop.tsx', 'utf8')) && /Gekopieerd/.test(readFileSync('src/uitrol/KopieerBlokKnop.tsx', 'utf8')));

  const css = readFileSync('src/uitrol/upload.css', 'utf8');
  check('rechtsboven in het blok', /\.ut-beschrijving\{position:relative\}/.test(css) && /\.ut-blok-kopie\{position:absolute;top:8px;right:8px/.test(css));
  check('titel maakt ruimte (geen overlap)', /\.ut-beschrijving h4\{padding-right:36px\}/.test(css));
  check('visueel 28px, klikvlak ≥44px (inset:-8px)', /width:28px;height:28px/.test(css) && /\.ut-blok-kopie-knop::before\{[^}]*inset:-8px/.test(css));
  check('kleuren via thema-variabelen (licht+donker)', /\.ut-blok-kopie-knop\{[^}]*var\(--ut-muted\)/.test(css));
  check('geen @media vóór de nieuwe regels-vereiste geschonden: mediaregels staan onderaan', css.lastIndexOf('.ut-blok-kopie') < css.indexOf('@media'));
  const up = readFileSync('src/uitrol/Upload.tsx', 'utf8');
  check('knop zit in .ut-beschrijving («Що змінено»), los van vlag', /ut-beschrijving' ref=\{beschrijvingRef\}[\s\S]{0,200}<KopieerBlokKnop/.test(up));

  const s = { gebruikteBron: 'releasemap', hoofdbron: 'runs', tijd: '2026-10-29T22:30:00+01:00' } as any;
  const u1 = nietNieuwerUitleg('uk', '20261029-220522', '20261029-220522', s);
  check('uk: noemt beide versies + bron + «уже встановлено»', u1.includes('Версія пакета: 20261029-220522') && u1.includes('Зараз працює: 20261029-220522') && u1.includes('тека current') && u1.includes('уже встановлено'));
  const n1 = nietNieuwerUitleg('nl', '20261029-100000', '20261029-220522', s);
  check('nl: ouder pakket + bron', n1.includes('Versie van het pakket: 20261029-100000') && n1.includes('Nu actief: 20261029-220522') && n1.includes('ouder dan'));
  check('zonder stand → bron = UITROL-VERSIE van de app', nietNieuwerUitleg('nl', 'a', 'b').includes('UITROL-VERSIE van de draaiende app'));
  check('Upload toont de uitleg bij NIET_NIEUWER', up.includes("p === 'NIET_NIEUWER' ? <span className='ut-hint' data-ut-niet-nieuwer>"));
  return einde();
}
