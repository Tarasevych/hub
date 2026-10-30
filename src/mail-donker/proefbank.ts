/**
 * Proefbank (alleen tests/scripts, nooit in de app geladen): dezelfde voorbereiding als MailBerichtTekst (opschonen, stijlen
 * inline, veiligheid) plus de donkere omzetting, in een echte browser. Gebruikt door tests/eenheid/mail-donker-browser.test.ts
 * en scripts/visueel-mail.mjs.
 */
import { bereidMailVoor } from '../MailBerichtTekst';
import { maakMailDonker, contrast, leesKleur, meng, type Rgba } from '../../shared/mail-donker';
import { volgLogos } from './logo-toets';

declare global { interface Window { mailProefbank: typeof proefbank } }
const proefbank = {
  licht: (html: string) => bereidMailVoor(html, 'Eerdere correspondentie'),
  donker: (html: string, oppervlak = '#1e2026') => bereidMailVoor(html, 'Eerdere correspondentie', { oppervlak, tekst: '#e7e9ee' }),
  maakMailDonker, volgLogos,
  /** Meet alle zichtbare tekst in `doc`: laagste contrast t.o.v. de werkelijke (samengestelde) achtergrond. */
  meetContrast(doc: Document) {
    const win = doc.defaultView!, uit: { tekst: string; kleur: string; achter: string; ratio: number; doel: number; beeld: boolean }[] = [];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.nodeValue || '').trim(); const el = n.parentElement; if (!t || !el) continue;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const cs = win.getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const lagen: Rgba[] = []; let beeld = false;
      for (let a: Element | null = el; a; a = a.parentElement) {
        const s = win.getComputedStyle(a); if (s.backgroundImage !== 'none' && !/gradient/.test(s.backgroundImage)) beeld = true;
        if (/gradient/.test(s.backgroundImage)) { const k = (s.backgroundImage.match(/rgba?\([^)]*\)/g) || []).map(leesKleur).filter(Boolean) as Rgba[]; if (k.length) { lagen.push({ r: k.reduce((x, c) => x + c.r, 0) / k.length, g: k.reduce((x, c) => x + c.g, 0) / k.length, b: k.reduce((x, c) => x + c.b, 0) / k.length, a: 1 }); break; } }
        const k = leesKleur(s.backgroundColor); if (k && k.a > 0) { lagen.push(k); if (k.a >= 1) break; }
      }
      let achter: Rgba = { r: 255, g: 255, b: 255, a: 1 }; // iframe zonder kleur = canvas wit (licht) — donker zet altijd html/body
      const htmlBg = leesKleur(win.getComputedStyle(doc.documentElement).backgroundColor); if (htmlBg && htmlBg.a > 0) achter = meng(htmlBg, achter);
      for (let i = lagen.length - 1; i >= 0; i -= 1) achter = meng(lagen[i], achter);
      const kleur = meng(leesKleur(cs.color)!, achter), px = parseFloat(cs.fontSize), vet = +cs.fontWeight >= 700;
      const doel = px >= 24 || (vet && px >= 18.66) ? 3 : 4.5;
      uit.push({ tekst: t.slice(0, 40), kleur: cs.color, achter: `rgb(${achter.r | 0},${achter.g | 0},${achter.b | 0})`, ratio: +contrast(kleur, achter).toFixed(2), doel, beeld: beeld || cs.textShadow !== 'none' });
    }
    return uit;
  },
  /** Maten en posities van alle elementen (opmaakvergelijking voor/na). */
  vakken(doc: Document) { return Array.from(doc.body.querySelectorAll('*')).map((e) => { const r = e.getBoundingClientRect(); return [e.tagName, Math.round(r.x * 2) / 2, Math.round(r.y * 2) / 2, Math.round(r.width * 2) / 2, Math.round(r.height * 2) / 2]; }); },
};
window.mailProefbank = proefbank;
