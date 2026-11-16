// MAILBEELD-003 (16.11.2026). Павло: «треба ще зберегти структуру листа, бо часто коли в листі були певних розмірів фото, які не
// показувалися, вони рушили всю структуру … це ж можна зробити без запиту на сервер відправника, щоб розміри попереднього зберігалися?»
// і на знімку смуги: «кнопки треба візуально відобразити гарно, типу піктограмами, щоб можна було візуально зрозуміти значення кнопки».
// Zonder de wijziging faalt deze test: src/mail/beeld-maten.ts bestond niet (een verborgen beeld zonder width/height in de brief kreeg
// altijd een geschatte tegel van 220 px of 16:9 tot 168 px, ook als het beeld op dit apparaat al eens getoond was), de tegel kende geen
// echte maat, en de knoppen van de beeldenstrook waren kale woorden zonder pictogram of uitleg van het gevolg.
// Bewaakt vooral: er gaat NIETS naar buiten (geen fetch, alleen naturalWidth/Height van een al getekend beeld), de opslag bevat geen
// URL, is per account + mailbox, begrensd, en afmelden wist hem.
import { existsSync, readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const { check, einde } = checker('mail-beeld-maten-20261116');

class Opslag { m = new Map<string, string>(); get length() { return this.m.size; } key(i: number) { return [...this.m.keys()][i] ?? null; } getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, String(v)); } removeItem(k: string) { this.m.delete(k); } clear() { this.m.clear(); } }
const lokaal = new Opslag();
Object.assign(globalThis, { localStorage: lokaal });

const pad = 'src/mail/beeld-maten.ts';
check('src/mail/beeld-maten.ts bestaat', existsSync(pad));
if (existsSync(pad)) {
  const M = await import('../../src/mail/beeld-maten');
  const T = await import('../../src/mail/beeld-tegel');
  const sporen = await import('../../src/lokale-sporen');
  const A = 'eigenaar-1\u001fgmail-a', B = 'eigenaar-2\u001fgmail-b';
  const held = 'https://voorbeeld.invalid/held.jpg?u=PERSOONLIJKE-CODE-123';

  // ---------------------------------------------------------------- 1. puur: hash, maat, tekst
  check('hash: dezelfde invoer → dezelfde hash; ander bereik of andere URL → andere hash', M.maatHash(A, held) === M.maatHash(A, held) && M.maatHash(A, held) !== M.maatHash(B, held) && M.maatHash(A, held) !== M.maatHash(A, `${held}x`));
  check('hash: kort en zonder URL-tekens', /^[0-9a-z]{1,12}$/.test(M.maatHash(A, held)));
  check('maat: alleen hele getallen 1…20000', M.geldigeMaat(640, 427) && M.geldigeMaat(1, 1) && !M.geldigeMaat(0, 10) && !M.geldigeMaat(10.5, 10) && !M.geldigeMaat(20001, 10) && !M.geldigeMaat('640', 427) && !M.geldigeMaat(NaN, 1));
  check('maattekst: heen en terug, onzin → null', M.maatTekst({ b: 640, h: 427 }) === '640x427' && M.leesMaatTekst('640x427')?.h === 427 && M.leesMaatTekst('0x5') === null && M.leesMaatTekst('640x427;color:red') === null && M.leesMaatTekst(null) === null && M.leesMaatTekst('99999x1') === null);

  // ---------------------------------------------------------------- 2. onthouden, terugvinden, opslag zonder URL
  check('nog niets bewaard → null', M.bewaardeMaat(A, held) === null);
  check('0 × 0 (nog niet geladen, kapot beeld) telt niet', M.onthoudMaat(A, held, 0, 0) === false && M.bewaardeMaat(A, held) === null);
  check('echte maat onthouden', M.onthoudMaat(A, held, 640, 427) === true);
  check('terugvinden in hetzelfde bereik', JSON.stringify(M.bewaardeMaat(A, held)) === '{"b":640,"h":427}');
  check('ander account/mailbox ziet de maat niet', M.bewaardeMaat(B, held) === null);
  check('dezelfde maat nog eens = geen nieuwe schrijfbeurt', M.onthoudMaat(A, held, 640, 427) === false);
  M.matenNuBewaren();
  const ruw = lokaal.getItem(M.matenSleutel(A)) || '';
  check('opgeslagen onder het eigen voorvoegsel', M.matenSleutel(A).startsWith(sporen.MATEN_VOORVOEGSEL) && ruw.length > 0);
  check('opslag bevat GEEN URL en geen persoonlijke code, alleen hash → [b, h, dag]', !ruw.includes('voorbeeld') && !ruw.includes('PERSOONLIJKE') && !ruw.includes('https') && /^\{"[0-9a-z]+":\[640,427,\d+\]\}$/.test(ruw), ruw);
  M.vergeetMaten();
  check('na herladen (geheugen leeg) nog uit de opslag', M.bewaardeMaat(A, held)?.b === 640);

  // kapotte opslag levert niets op en breekt niets
  lokaal.setItem(M.matenSleutel(B), '{"abc":[10,10,1],"<script>":[5,5,1],"def":["9",9,1],"ghi":[0,4,1],"jkl":[30000,5,1]}');
  M.vergeetMaten();
  check('kapotte of vijandige rijen worden overgeslagen', M.bewaardeMaat(B, 'x') === null);
  lokaal.setItem(M.matenSleutel(B), 'geen json');
  M.vergeetMaten();
  check('geen JSON → leeg, geen fout', M.bewaardeMaat(B, held) === null && M.onthoudMaat(B, held, 20, 10) === true);

  // ---------------------------------------------------------------- 3. begrensd: het langst niet gebruikte gaat eerst weg
  {
    const C = 'eigenaar-3\u001fgmail-c';
    for (let i = 0; i < M.MATEN_MAX + 5; i += 1) M.onthoudMaat(C, `https://x.invalid/${i}.png`, 10 + (i % 50), 10);
    M.matenNuBewaren();
    const n = Object.keys(JSON.parse(lokaal.getItem(M.matenSleutel(C)) || '{}')).length;
    check(`hoogstens ${M.MATEN_MAX} beelden per bereik`, n === M.MATEN_MAX, String(n));
    check('het oudste is weg, het nieuwste staat er', M.bewaardeMaat(C, 'https://x.invalid/0.png') === null && M.bewaardeMaat(C, `https://x.invalid/${M.MATEN_MAX + 4}.png`) !== null);
  }

  // ---------------------------------------------------------------- 4. afmelden wist de maten (opslag én geheugen)
  {
    const D = 'eigenaar-4\u001fgmail-d';
    M.onthoudMaat(D, held, 300, 200);
    M.matenNuBewaren();
    check('vóór afmelden aanwezig', !!lokaal.getItem(M.matenSleutel(D)));
    sporen.wisLokaleSporen('eigenaar-4', lokaal as unknown as Parameters<typeof sporen.wisLokaleSporen>[1]);
    check('afmelden wist de sleutel van dit account', lokaal.getItem(M.matenSleutel(D)) === null);
    check('…en de kopie in het geheugen (naWissen)', M.bewaardeMaat(D, held) === null);
    check('…maar niet die van een ander account', M.bewaardeMaat(A, held)?.b === 640);
    check('het voorvoegsel staat in de lijst van het afmelden', /const VOORVOEGSELS = \[[^\]]*MATEN_VOORVOEGSEL[^\]]*\]/.test(readFileSync('src/lokale-sporen.ts', 'utf8')));
  }

  // ---------------------------------------------------------------- 5. de tegel gebruikt de echte maat
  {
    const echt = { b: 640, h: 427 };
    const kaal = T.tegelMaat({ alt: 'Najaar', echt });
    check('zonder maat in de brief: de eigen breedte en verhouding van het beeld (geen 220 px, geen plafond van 168 px)', kaal.breedte === '640px' && kaal.verhouding === '640 / 427' && kaal.maxHoogte === '' && kaal.schatH === 427, JSON.stringify(kaal));
    const pct = T.tegelMaat({ breedteAttr: '100%', alt: '', echt });
    check('width="100%": breedte uit de brief, verhouding van het beeld', pct.breedte === '100%' && pct.verhouding === '640 / 427' && pct.maxHoogte === '', JSON.stringify(pct));
    const stijl = T.tegelMaat({ stijlBreedte: '100%', alt: 'x', echt });
    check('breedte in de stijl blijft van de stijl, verhouding van het beeld', stijl.breedte === '' && stijl.verhouding === '640 / 427', JSON.stringify(stijl));
    const fout = T.tegelMaat({ breedteAttr: '600', hoogteAttr: '300', alt: 'x', echt });
    check('brief zegt 600×300 maar het beeld is 640×427: het leesvenster tekent height:auto, dus de verhouding van het beeld', fout.breedte === '600px' && fout.verhouding === '640 / 427' && fout.schatH === 400, JSON.stringify(fout));
    const hoog = T.tegelMaat({ hoogteAttr: '48', alt: 'Logo', echt: { b: 200, h: 48 } });
    check('alleen een hoogte in de brief: het beeld tekent op eigen maat, de tegel ook', hoog.breedte === '200px' && hoog.hoogte === '' && hoog.verhouding === '200 / 48', JSON.stringify(hoog));
    const pixel = T.tegelMaat({ alt: '', echt: { b: 1, h: 1 } });
    check('volgpixel zonder maat in de brief: 1 × 1 in plaats van een blokje van 40 × 40', pixel.breedte === '1px' && pixel.verhouding === '1 / 1' && T.tegelVorm(pixel.schatB, pixel.schatH, '') === 'leeg', JSON.stringify(pixel));
    check('vaste ruimte: echte maat zonder maat in de brief → onzichtbaar <svg> van 640 × 427 (krimpt mee als een beeld, duwt geen tabel open)', JSON.stringify(kaal.ruimte) === '{"b":640,"h":427,"uitBrief":false}');
    check('vaste ruimte: brief zegt width="600" → 600 × 400 met de verhouding van het beeld', JSON.stringify(fout.ruimte) === '{"b":600,"h":400,"uitBrief":true}');
    check('geen vaste ruimte bij een breedte in procent of in de stijl (die blijft van de brief)', pct.ruimte === null && stijl.ruimte === null);
    const banner = T.tegelMaat({ alt: 'Najaar', blok: true }), inline = T.tegelMaat({ alt: 'Logo' });
    check('blokbeeld zonder enige maat: een banner van 600 × 240 die met de kolom meekrimpt; inline blijft het 220 px', JSON.stringify(banner.ruimte) === '{"b":600,"h":240,"uitBrief":false}' && inline.breedte === '220px' && JSON.stringify(inline.ruimte) === '{"b":220,"h":124,"uitBrief":false}', JSON.stringify(banner));
    check('ook zonder echte maat een vaste ruimte voor een breedte in px (width="600" duwde een tabel op de telefoon breder dan het scherm)', JSON.stringify(T.tegelMaat({ breedteAttr: '600', hoogteAttr: '300', alt: 'x' }).ruimte) === '{"b":600,"h":300,"uitBrief":true}' && JSON.stringify(T.tegelMaat({ breedteAttr: '600', alt: 'x' }).ruimte) === '{"b":600,"h":168,"uitBrief":true}');
    check('zonder echte maat: alles zoals voorheen', T.tegelMaat({ alt: 'Foto' }).breedte === '220px' && T.tegelMaat({ alt: 'Foto', echt: null }).maxHoogte === '168px' && T.tegelMaat({ alt: 'Foto', echt: { b: 0, h: 5 } }).breedte === '220px');
  }
}

// ---------------------------------------------------------------- 6. bedrading in de bron
{
  const maten = readFileSync('src/mail/beeld-maten.ts', 'utf8');
  check('beeld-maten: geen enkel verzoek (geen fetch, XHR, Image, sendBeacon)', !/\bfetch\s*\(|XMLHttpRequest|new Image\b|sendBeacon/.test(maten));
  const tegel = readFileSync('src/mail/beeld-tegel.ts', 'utf8');
  check('tegel leest de maat van het data-attribuut van het beeld', tegel.includes("echt: leesMaatTekst(img.getAttribute('data-mail-beeld-maat'))"));
  const bt = readFileSync('src/MailBerichtTekst.tsx', 'utf8');
  check('lezer: maat alleen voor externe https-beelden uit het geheugen, anders het attribuut weg (de afzender kan het niet zetten)', bt.includes("bewaardeMaat(cacheAccountId,source):null;if(m)img.setAttribute('data-mail-beeld-maat',maatTekst(m));else img.removeAttribute('data-mail-beeld-maat')"));
  check('lezer: pas na het tekenen (load) onthouden, met naturalWidth/naturalHeight — en niet meer na het opruimen (afmelden, andere brief)', /addEventListener\('load',\(\)=>\{if\(!cancelled\)onthoudMaat\(cacheAccountId,source,img\.naturalWidth,img\.naturalHeight\)\},\{once:true\}\);img\.src=url/.test(bt));
  check('lezer: de maat wordt gezet vóór de tegels geplaatst worden', bt.indexOf("img.setAttribute('data-mail-beeld-maat'") < bt.indexOf('let cursor=0;const worker'));

  // knoppen van de beeldenstrook
  const strook = bt.slice(bt.indexOf('function BeeldenStrook('), bt.indexOf('function BeeldenStrook(') + 4000);
  check('knoppen: pictogram oog (één keer) en persoon met vinkje (altijd van afzender)', strook.includes("data-beelden-knop='eenmaal'") && strook.includes('<Eye aria-hidden=') && strook.includes("data-beelden-knop='afzender'") && strook.includes('<UserCheck/>'));
  check('knoppen: «!» op de riskantere knop', /mail-beelden-knop-icoon' aria-hidden='true'><UserCheck\/><b>!<\/b>/.test(strook));
  check('knoppen: knopinfo legt het gevolg uit (niet de naam herhalen), en dezelfde tekst is de beschrijving voor de schermlezer', strook.includes("uitlegEenmaal=t('Показати зображення лише в цьому листі й лише зараз.") && strook.includes("uitlegAfzender=t('! Зображення від цього відправника завантажуватимуться одразу")
    && strook.includes('aria-describedby={`${uid}-eenmaal`} data-tooltip={uitlegEenmaal}') && strook.includes('aria-describedby={`${uid}-afzender`} data-tooltip={uitlegAfzender}') && strook.includes("<span className='mail-beelden-knop-uitleg' id={`${uid}-afzender`}>{uitlegAfzender}</span>") && /\.mail-beelden-knop-uitleg\{position:absolute;width:1px;height:1px;[^}]*clip:rect\(0,0,0,0\)/.test(readFileSync('src/mail/gesprek-opmaak.css', 'utf8')));
  check('knoppen: volledige naam voor de schermlezer; «Завжди показувати від цього відправника» nooit ingekort (werkwoord én afzender)', strook.includes("aria-label={t('Показати один раз','Eén keer tonen')}") && strook.includes("<span className='mail-beelden-knop-lang'>{t('Завжди показувати від цього відправника','Altijd tonen van deze afzender')}</span>") && !strook.includes("t('Завжди показувати','Altijd tonen')") && !strook.includes("t('Завжди','Altijd')"));
  const css = readFileSync('src/mail/gesprek-opmaak.css', 'utf8');
  check('css: smalle strook → korte woorden (container query)', css.includes('.mail-beelden-strook{container:beeldenstrook/inline-size}') && /@container beeldenstrook \(max-width:640px\)\{[^}]*mail-beelden-knop-lang\{display:none\}/.test(css));
  check('css: «!» in de waarschuwingstint met themakleur (leesbaar licht én donker)', css.includes('background:var(--warn);color:var(--panel)'));
  check('css: smalle strook → de afzenderknop breekt af in plaats van in te korten; telefoon → volle regels met de lange namen', /\.mail-beelden-strook>button\.mail-beelden-knop\[data-beelden-knop='afzender'\]\{white-space:normal/.test(css) && css.includes('html body .mail-beelden-strook>button.mail-beelden-knop .mail-beelden-knop-lang{display:inline}'));
  const sporen = readFileSync('src/lokale-sporen.ts', 'utf8');
  check('afmelden: de luisteraars vergeten hun kopie ook als er (nog) niets in de opslag stond', !/if \(n\) for \(const f of naWissen\)/.test(sporen) && sporen.includes('for (const f of naWissen) {'));
  const mt = readFileSync('src/mail/beeld-maten.ts', 'utf8');
  check('ander tabblad wiste of schreef: de kopie hier vergeten (storage-gebeurtenis)', mt.includes("window.addEventListener('storage'") && mt.includes('geheugen.delete(e.key)'));
  const tg = readFileSync('src/mail/beeld-tegel.ts', 'utf8');
  check('zwevend of los gepositioneerd beeld zonder maat → geen banner van 600 px (de browser maakt er een blok van, het is een logo naast tekst)', tg.includes('blok: n.blok && !n.los') && tg.includes("los: (!!eigen.float && eigen.float !== 'none') || eigen.position === 'absolute'"));
  check('vaste ruimte telt binnenmarge en rand van het beeld mee (met width-attribuut zit die erin, border-box)', tg.includes('if (maat.ruimte.uitBrief) rh = Math.max(1, Math.round(Math.max(1, rb - rx) * maat.ruimte.h / maat.ruimte.b + ry));') && tg.includes("st.padding = '0';"));
}

process.exit(einde());
