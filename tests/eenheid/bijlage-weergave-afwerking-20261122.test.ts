// Спільний перегляд вкладень, afwerking etappe 2 (22.11.2026, Grok: hub.tarasevych.com). Alles achter vlaggen, standaard UIT.
// Dekt: PDF-stand per bestand, labels en waarden in de NL-modus, «Назад» in rechts/onder/zwevend, viewer binnen het zwevende venster,
// donkere documentpagina’s (keuze, standaard uit), te groot bestand → downloaden, leeg bestand, trapsgewijze vensters, Escape boven
// het opslaanvenster, taalstrook in een smalle kop, ruis van ResizeObserver in de diagnose.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { leesPdfPlek, bewaarPdfPlek, bewaarPlek, leesPlek } from '../../src/bijlage-weergave/gedrag';
import { toonLabel, toonNaam, toonWaarde } from '../../src/bijlage-weergave/labels';
import { NL_MOTOR_TEKSTEN } from '../../src/bijlage-weergave/nl-teksten';
import { vertrouwenUit } from '../../src/bijlage-weergave/vertrouwen';

class NepOpslag implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
}

export async function main(): Promise<number> {
  const { check, einde } = checker('bijlage-weergave-afwerking-20261122');
  const lees = (p: string) => readFileSync(p, 'utf8');

  // 1. PDF-stand
  const o = new NepOpslag();
  bewaarPlek(o, 'k', { boven: 120, links: 0, zoom: 1 });
  bewaarPdfPlek(o, 'k', { fit: 'page', zoom: 1.2, pagina: 3 });
  const pdf = leesPdfPlek(o, 'k');
  check('PDF: passen, zoom en pagina terug; scrollplek blijft', pdf?.fit === 'page' && pdf.zoom === 1.2 && pdf.pagina === 3 && leesPlek(o, 'k')?.boven === 120);
  bewaarPlek(o, 'k', { boven: 300, links: 0, zoom: 1 });
  check('PDF: nieuwe scrollplek wist de PDF-stand niet', leesPdfPlek(o, 'k')?.pagina === 3);
  o.setItem('x', JSON.stringify({ pdf: { fit: 'raar', zoom: 99, pagina: -4 } }));
  const raar = leesPdfPlek(o, 'x');
  check('PDF: vreemde waarden begrensd', raar?.fit === 'width' && raar.zoom === 4 && raar.pagina === 1);
  check('PDF: geen sleutel zonder vlag', lees('src/MailPdfVoorbeeld.tsx').includes('useActievePlek()'));

  // 3. labels en waarden
  check('label: Engelse sleutel → Oekraïens / Nederlands', toonLabel('Encoding', 'uk') === 'Кодування' && toonLabel('Encoding', 'nl') === 'Codering');
  check('label: HEIC-merken in NL', toonLabel('Сумісні бренди', 'nl') === 'Compatibele merken' && toonLabel('Сумісні бренди', 'uk') === 'Сумісні бренди');
  check('label: onbekend blijft ongewijzigd', toonLabel('Щось нове', 'nl') === 'Щось нове');
  check('waarde: NL vertaalt vaste stukjes', toonWaarde('216 байтів', 'nl') === '216 bytes' && toonWaarde('записів: 2 · 106 байтів', 'nl') === 'vermeldingen: 2 · 106 bytes' && toonWaarde('не підтверджено', 'nl') === 'niet bevestigd');
  check('waarde: UK en niet-tekst ongewijzigd', toonWaarde('216 байтів', 'uk') === '216 байтів' && toonWaarde(42, 'nl') === 42);
  check('waarde: lezers vergelijken nog op de oorspronkelijke sleutel', lees('src/MailBeveiligingVoorbeeld.tsx').length > 0 && !lees('src/bijlage-weergave/labels.ts').includes('localName'));

  // 5. «Назад» en vensters
  const kad = lees('src/mail/LeesVenster.tsx');
  check('Назад: oude stap telefoon/volledig ongewijzigd, rechts/onder/zwevend alleen met vlag', kad.includes('const nodig = geschiedenisStap(modus) && !p.geminimaliseerd;') && kad.includes("const stapOveral = useVlag(POSTA_VENSTERS_VLAG, false);") && kad.includes("stapOveral && (modus === 'rechts' || modus === 'onder' || modus === 'zwevend')"));
  const gmw = lees('src/GoogleMailWerkruimte.tsx');
  check('zwevend: viewer binnen het venster alleen met gedeelde weergave, telefoon niet', gmw.includes('if(!gedeeldeWeergave||!(attachmentPreview||weergaveStaat)||attachmentMinimized)') && gmw.includes('innerWidth<=720') && gmw.includes("data-binnen-venster={binnenStijl?'ja':undefined}"));
  check('Escape: eerst het opslaanvenster, alleen met gedeelde weergave', gmw.includes("if(event.key==='Escape'&&gedeeldeRef.current&&document.querySelector('.mail-save-backdrop')){event.preventDefault();setSaveItems(null);"));
  check('te groot: knop downloaden in plaats van opnieuw', gmw.includes('onDownload={()=>void downloadAttachment(weergaveStaat.messageId,weergaveStaat.item,weergaveStaat.accountId)}') && lees('src/bijlage-weergave/Weergave.tsx').includes("/TOO_LARGE/.test(p.code) && Boolean(p.onDownload)"));
  const bv = lees('src/MailBijlageVensters.tsx'), pv = lees('src/platform/vensters.tsx');
  check('vensters trapsgewijs alleen met vlag; MailBijlageVensters ongewijzigd; standaard verschuiving 0', !bv.includes('verschuiving') && pv.includes("className.includes('mail-bijlage-venster') && document.documentElement.hasAttribute('data-posta-vensters-herstel')") && pv.includes('verschuiving = 0'));

  const leeg = vertrouwenUit({ naam: 'leeg.txt', kop: new Uint8Array(0) });
  check('leeg bestand: geen vals alarm, niveau onbekend', leeg.niveau === 'onbekend' && !leeg.zin[0].includes('Увага'));
  check('leeg bestand: kop zegt «файл порожній»', lees('src/bijlage-weergave/Weergave.tsx').includes('файл порожній, вмісту немає'));

  // 7. donkere pagina’s
  const w = lees('src/bijlage-weergave/Weergave.tsx'), css = lees('src/bijlage-weergave/weergave.css');
  check('donker: standaard uit, onthouden, alleen voor papier', w.includes("=== 'aan'") && w.includes("DONKER_SLEUTEL = 'tsv:bijlage-donkere-paginas'") && css.includes('[data-donkere-paginas]'));
  check('menu boven de inhoud (z-index op de kop)', css.includes('.weergave-kop { position: relative; z-index: 40;'));

  // 6. bron van de ResizeObserver-lusfouten
  const mbt = lees('src/MailBerichtTekst.tsx');
  check('brieftekst: met vlag geen observer op html/body van het iframe, wel breedte van de houder + MutationObserver', mbt.includes('const eigenRoAan=useVlag(POSTA_VENSTERS_VLAG,false)') && mbt.includes('observer.observe(houder)') && mbt.includes('new MutationObserver(later)') && !/observer\.observe\(frame\)/.test(mbt));
  check('brieftekst: zonder vlag de oude observer (html en body)', mbt.includes('}else{observer=new ResizeObserver(resize);observer.observe(doc.documentElement);if(doc.body)observer.observe(doc.body)}'));
  // 6. diagnose
  check('diagnose: dezelfde melding direct na elkaar telt met (×N)', lees('src/ai-site-acties.ts').includes('laatste.message = `${tekst} (×${n})`'));
  check('uitrol: onvolledig antwoord geeft geen paginafout', lees('src/platform/uitrol-achtergrond-beheer.ts').includes('goedgekeurd?.length ?? 0'));
  // 7. NL-modus: vaste teksten van de formaatlezers
  check('NL-woordenboek: meer dan 1200 lezerteksten, Nederlandse kant zonder Cyrillisch, dezelfde {n}', NL_MOTOR_TEKSTEN.length >= 1200 && NL_MOTOR_TEKSTEN.every(([uk, nl]) => !/[\u0400-\u04ff]/.test(nl) && JSON.stringify((uk.match(/\{\d\}/g) || []).sort()) === JSON.stringify((nl.match(/\{\d\}/g) || []).sort())));
  check('NL: HEIC-codecmelding', toonWaarde('HEIC: поточний кодек браузера не розкодував контейнер. Показано лише підтверджені дані контейнера й вбудованого попереднього перегляду.', 'nl') === 'HEIC: de huidige codec van de browser heeft de container niet gedecodeerd. Alleen bevestigde gegevens van de container en de ingebouwde voorvertoning worden getoond.');
  check('NL: EML-label en ZIP-label', toonLabel('EML · інтернет-лист', 'nl') === 'EML · internetbericht' && toonLabel('Архів ZIP', 'nl') === 'ZIP-archief');
  check('NL: ZIP-rij (metagegevens met ingevoegde waarden)', toonWaarde('#2 · метод 8 · стиснено 1234 B · encrypted', 'nl') === '#2 · methode 8 · gecomprimeerd 1234 B · versleuteld');
  check('NL: ingevoegd stuk wordt zelf ook vertaald', toonWaarde('Слайд 3: вбудоване зображення не вдалося декодувати.', 'nl') === 'Dia 3: de ingebouwde afbeelding kon niet worden gedecodeerd.' && toonWaarde('сирий образ · GPT', 'nl') === 'ruwe kopie · GPT');
  check('UK-modus blijft ongewijzigd; onbekende tekst blijft staan', toonWaarde('Архів ZIP', 'uk') === 'Архів ZIP' && toonLabel('Архів ZIP', 'uk') === 'Архів ZIP' && toonWaarde('щось зовсім інше', 'nl') === 'щось зовсім інше');
  check('namen van items: alleen een exacte treffer (geen sjabloon op «Розділ 1.docx»)', toonNaam('Розділ 1.docx', 'nl') === 'Розділ 1.docx' && toonNaam('Корінь', 'nl') === 'Wortel');
  const graf = lees('src/MailGrafischVoorbeeld.tsx'), arch = lees('src/MailArchiefVoorbeeld.tsx'), ber = lees('src/MailBerichtVoorbeeld.tsx');
  check('weergaven tonen lezerteksten via toonLabel/toonWaarde/toonNaam', graf.includes('<ShieldCheck/>{toonWaarde(warning,lang)}</p>') && arch.includes('<td>{toonWaarde(row.meta,lang)}</td>') && arch.includes('<td>{toonNaam(row.name,lang)}</td>') && ber.includes('{toonLabel(capability.label,lang)}'));
  return einde();
}
