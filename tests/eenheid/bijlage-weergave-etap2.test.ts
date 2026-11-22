// Спільний перегляд вкладень, етап 2 (22.11.2026, Grok: hub.tarasevych.com). Vlag bijlage-weergave-gedeeld-v1 standaard UIT.
// Dekt: vegen, plek onthouden, afzender in de vertrouwenslabel, lui laden van kaarten, Escape bij ingeklapte viewer, mailbalk inert.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { veegRichting, plekSleutel, leesPlek, bewaarPlek } from '../../src/bijlage-weergave/gedrag';
import { vertrouwenUit, metAfzender } from '../../src/bijlage-weergave/vertrouwen';

class NepOpslag implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
}
const bytes = (...x: (number | string)[]) => Uint8Array.from(x.flatMap((v) => (typeof v === 'string' ? [...v].map((c) => c.charCodeAt(0)) : [v])));

export async function main(): Promise<number> {
  const { check, einde } = checker('bijlage-weergave-etap2');

  // vegen
  check('vegen naar links = volgende, naar rechts = vorige', veegRichting(-120, 10, 200) === 1 && veegRichting(130, -5, 300) === -1);
  check('geen veeg: te kort, te schuin of te traag', veegRichting(-40, 0, 100) === 0 && veegRichting(-100, 90, 100) === 0 && veegRichting(-200, 0, 900) === 0);

  // plek onthouden
  const o = new NepOpslag();
  const k = plekSleutel('eigenaar-1', 'acc-a', 'bericht-1', 'bijlage-9');
  check('sleutel per profiel, account, bericht en bijlage', k === 'tsv:bijlage-plek:eigenaar-1:acc-a:bericht-1:bijlage-9' && k !== plekSleutel('eigenaar-2', 'acc-a', 'bericht-1', 'bijlage-9') && k !== plekSleutel('eigenaar-1', 'acc-b', 'bericht-1', 'bijlage-9'));
  check('zonder opgeslagen plek: null', leesPlek(o, k) === null);
  bewaarPlek(o, k, { boven: 1234, links: 5, zoom: 1.5 }, 1000);
  const p = leesPlek(o, k);
  check('plek wordt bewaard en gelezen', !!p && p.boven === 1234 && p.links === 5 && p.zoom === 1.5);
  o.setItem(k, '{kapot');
  check('beschadigde waarde: null, geen fout', leesPlek(o, k) === null);
  o.setItem(k, JSON.stringify({ boven: -5, links: 0, zoom: 99, t: 1 }));
  check('waarden begrensd', leesPlek(o, k)!.boven === 0 && leesPlek(o, k)!.zoom === 4);
  const veel = new NepOpslag();
  for (let i = 0; i < 205; i++) bewaarPlek(veel, plekSleutel('p', 'a', 'b', `x${i}`), { boven: i, links: 0, zoom: 1 }, i + 1);
  check('opruimen: hoogstens 200 plekken, de oudste eerst weg', veel.length === 200 && leesPlek(veel, plekSleutel('p', 'a', 'b', 'x0')) === null && leesPlek(veel, plekSleutel('p', 'a', 'b', 'x204'))?.boven === 204);
  check('bewaren zonder opslag faalt niet', (() => { bewaarPlek(null, k, { boven: 1, links: 0, zoom: 1 }); return true; })());

  // afzender
  const basis = vertrouwenUit({ naam: 'factuur.pdf', kop: bytes('%PDF-1.7\n'), inhoud: '%PDF-1.7 /Type /Page' });
  check('zonder afzenderantwoord: eerlijk «ще не перевірено»', metAfzender(basis, null).bevindingen.some((b) => b.sleutel === 'afzender' && b.tekst[0] === 'Відправника ще не перевірено.'));
  const bekend = metAfzender(basis, { status: 'geverifieerd', opgeslagen: true, adres: 'boekhouding@voorbeeld.nl', bron: 'handmatig' });
  check('bekende afzender in contacten: groen en genoemd', bekend.niveau === 'goed' && bekend.zin[0].startsWith('Відомий відправник.') && bekend.bevindingen.some((b) => b.sleutel === 'afzender' && b.ernst === 'goed' && b.tekst[0].includes('у ваших контактах')));
  const nieuw = metAfzender(basis, { status: 'onbekend', opgeslagen: false, adres: 'nieuw@voorbeeld.nl', bron: null });
  check('onbekende afzender: niveau blijft, eerlijk vermeld', nieuw.niveau === basis.niveau && nieuw.zin[0].endsWith('Відправник невідомий.') && nieuw.bevindingen.some((b) => b.sleutel === 'afzender' && b.tekst[0].startsWith('Невідомий відправник')));
  const vals = metAfzender(basis, { status: 'verdacht', opgeslagen: false, adres: 'paypa1@voorbeeld.biz', bron: null });
  check('verdachte afzender: «Увага»', vals.niveau === 'let-op' && vals.kort[0] === 'Увага' && vals.zin[0].includes('видавати себе'));
  check('slechts één afzenderbevinding', vals.bevindingen.filter((b) => b.sleutel === 'afzender').length === 1);

  // bedrading
  const gmw = readFileSync('src/GoogleMailWerkruimte.tsx', 'utf8');
  check('Escape sluit een ingeklapte viewer niet (met vlag)', gmw.includes("if(event.key==='Escape'){/* etap 2: Escape sluit een ingeklapte viewer niet */if(attachmentMinimized&&gedeeldeRef.current)return;"));
  check('mailbalk achter de viewer inert', gmw.includes("useAchterInert(weergaveOpen,'.google-mail-reader > header')"));
  check('vegen alleen met vlag, open en niet ingezoomd', gmw.includes('useVeeg(attachmentDialogRef,gedeeldeWeergave&&!!attachmentPreview&&!attachmentMinimized,r=>adjacentAttachment(r),attachmentZoom>1.01)'));
  check('plek per accountprofiel', gmw.includes('plekSleutel(String(ownerUserId||\'\'),attachmentNav.accountId,attachmentNav.messageId,weergaveItem.providerAttachmentId)'));
  check('afzender uit de bestaande controle', gmw.includes('useAfzender(gedeeldeWeergave&&attachmentPreview&&weergaveBericht?'));
  check('miniaturen: eerst cache, netwerk alleen voor kleine foto’s', gmw.includes('cacheOnly:true}as AttachmentPreviewInput') && gmw.includes('<=2*1024*1024&&/^image\\//i.test'));
  const kaart = readFileSync('src/MailBijlageKaart.tsx', 'utf8');
  check('kaart: lui laden met vlag (IntersectionObserver)', kaart.includes('useVlag(WEERGAVE_VLAG,false)') && kaart.includes('new IntersectionObserver') && kaart.includes("presentation!=='preview'||gedeeld&&!zichtbaar"));
  check('kaart: grote bestanden alleen uit de cache', kaart.includes('KAART_MAX_BYTES=4*1024*1024') && kaart.includes('alleenKesh?{cacheOnly:true}:{}'));
  const css = readFileSync('src/bijlage-weergave/weergave.css', 'utf8');
  check('telefoon: hoofdknop basis 0 (label niet alleen op een rij)', css.includes('.weergave-rij > .weergave-hoofd { order: 3; flex: 1 1 0;'));
  return einde();
}
