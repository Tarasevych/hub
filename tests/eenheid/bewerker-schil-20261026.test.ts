// Блок 7 (26.10): одна оболонка Opsteller і п’ять спільних дефектів композиції.
import { readFileSync } from 'node:fs';
import { leesBriefAchtergrond } from '../../src/editor/achtergrond';
import { beeldBestanden, plakBeeld } from '../../src/editor/beeld';
import { losConceptOp } from '../../src/editor/concept-route';
import { sjabloonRijen } from '../../src/mail-sjablonen';

const lees = (pad: string) => readFileSync(pad, 'utf8');
const resultaten: Array<{ naam: string; ok: boolean; detail?: string }> = [];
const check = (naam: string, ok: boolean, detail = '') => {
  resultaten.push({ naam, ok, detail });
  console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${detail ? ` — ${detail}` : ''}`);
};

export async function main() {
  const editor = lees('src/MailOpstelBewerker.tsx');
  const css = lees('src/editor/opsteller.css');
  const menuCss = lees('src/mail-opstel-bewerker.css');
  const dialoog = lees('src/MailNieuwBerichtDialoog.tsx');
  const werk = lees('src/GoogleMailWerkruimte.tsx');
  const kiezer = lees('src/editor/SjabloonKiezer.tsx');
  const schil = lees('src/editor/Opsteller.tsx');

  check('посилання: клас mail-compose-link-editor і position:fixed', css.includes('.mail-compose-link-editor') && /position:\s*fixed/.test(css) && editor.includes("className='mail-compose-link-editor'"));
  check('оболонка Opsteller обгортає той самий ProseMirror-корінь', schil.includes('cloneElement') && editor.includes('<Opsteller') && editor.includes('</Opsteller>') && editor.includes("data-mail-compose-model='prosemirror'") && editor.includes("from './editor/Opsteller'"));
  check('Ctrl/Cmd+B лишається і після синхронізації value (editorPlugins двічі, не лише baseKeymap)', editor.includes("'Mod-b':toggleMark(schema.marks.strong)") && editor.split('editorPlugins()').length === 3 && !editor.includes('plugins:[history(),keymap(baseKeymap)]'));
  check('курсор: власний html не перезаписує стан, вибір через TextSelection', editor.includes('emittedHtmlRef') && editor.includes('TextSelection.create'));
  check('рідне контекстне меню: немає preventDefault, є data-native-context', !editor.includes('onContextMenu={event=>event.preventDefault()}') && editor.includes("data-native-context='1'"));
  check('фон листа: data-mail-bg, не перший чужий background', editor.includes('data-mail-bg="${esc(emailBackground)}"') && editor.includes('leesBriefAchtergrond'));
  check('зображення: paste/drop у редакторі і файл у «Новому листі»', editor.includes('handlePaste') && editor.includes('plakBeeld') && dialoog.includes('insertImage') && dialoog.includes('imageInputRef'));
  check('чернетка: losConceptOp, без старого if(tekst)-шлюзу в читач', werk.includes('losConceptOp') && werk.includes('ouderId') && werk.includes('rijOuder') && werk.includes("labelIds.includes('DRAFT')") && werk.includes("new CustomEvent('mail:open-concept'") && !werk.includes('if(tekst){window.dispatchEvent'));

  const staart = menuCss.slice(menuCss.indexOf('opsteller-sjabloon-hoogte'));
  check('шаблони на комп’ютері: height:auto, не всередині @media', staart.includes('height:auto!important') && !staart.includes('@media') && menuCss.includes('height:auto;min-height:38px') && !menuCss.includes('!important;height:38px'));
  check('«Вставити»: пошук, категорії, мініатюри, uk+nl', kiezer.includes('Вставити') && kiezer.includes('Invoegen') && kiezer.includes('data-sjabloon-miniatuur') && kiezer.includes('SJABLOON_CATEGORIEEN'));

  const uk = sjabloonRijen('uk').map((rij) => rij[0]);
  const nl = sjabloonRijen('nl').map((rij) => rij[0]);
  check('рядки шаблонів uk і nl різні', uk.includes('Діловий лист') && nl.includes('Zakelijke brief') && uk.join('|') !== nl.join('|'));

  const metCitaat = '<div style="background:#eef6ff">цитата</div><div data-mail-bg="#112233" style="background:#112233"><p>лист</p></div>';
  check('фон з data-mail-bg, не з цитати #eef6ff', leesBriefAchtergrond(metCitaat) === '#112233', leesBriefAchtergrond(metCitaat));
  check('без мітки лишається обгортка, інакше білий', leesBriefAchtergrond('<div style="background:#abcdef"><p>x</p></div>') === '#abcdef' && leesBriefAchtergrond('<p>x</p>') === '#ffffff');

  const png = { type: 'image/png', size: 32 } as File;
  const pdf = { type: 'application/pdf', size: 32 } as File;
  const groot = { type: 'image/png', size: 5 * 1024 * 1024 } as File;
  check('файл зображення приймається, pdf і завеликий — ні', beeldBestanden([png]).length === 1 && beeldBestanden([pdf, groot]).length === 0);
  const uitItems: string[] = [];
  const gepakt = plakBeeld({ clipboardData: { files: [], items: [{ kind: 'file', type: 'image/png', getAsFile: () => png }] } }, (src) => uitItems.push(src));
  check('буфер лише з items (без files) теж є зображенням', gepakt === true);

  const nieuw = losConceptOp({ id: 'd1', subject: 'Чернетка', plain: 'a<b & c', to: 'a@b.c' });
  check('окремий лист, plain екранується', nieuw.soort === 'nieuw' && nieuw.gmail.html.includes('<') && nieuw.gmail.html.includes('&') && nieuw.gmail.to === 'a@b.c');
  const antwoord = losConceptOp({
    id: 'd2',
    threadId: 't1',
    html: '<p>чернетка</p>',
    plain: 'чернетка',
    subject: 'Re: hi',
    berichten: [
      { id: 'm1', labelIds: ['INBOX'] },
      { id: 'd2', labelIds: ['DRAFT'] },
      { id: 'd3', labelIds: ['DRAFT'] },
    ],
  });
  check('відповідь на останній не-чернетковий лист', antwoord.soort === 'antwoord' && antwoord.ouderId === 'm1' && antwoord.html === '<p>чернетка</p>');
  const viaRij = losConceptOp({ id: 'd9', threadId: 't9', ouderId: 'm9', plain: 'tekst', berichten: [] });
  check('батько лише з ouderId — відповідь, навіть без листів у треді', viaRij.soort === 'antwoord' && viaRij.ouderId === 'm9');
  const zelfOuder = losConceptOp({ id: 'd9', threadId: 't9', ouderId: 'd9', plain: 'x' });
  check('ouderId самої чернетки не робить відповідь', zelfOuder.soort === 'nieuw');

  const mis = resultaten.filter((r) => !r.ok);
  console.log(`${resultaten.length - mis.length}/${resultaten.length} geslaagd (bewerker-schil-20261026)`);
  return mis.length ? 1 : 0;
}
