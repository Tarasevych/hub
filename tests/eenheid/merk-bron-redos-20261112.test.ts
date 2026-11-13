// SEC-002 / integraties-01 (12.11.2026): het ontleden van een VREEMD SVG- of HTML-bestand (logo van het domein van een afzender)
// mag nooit kwadratisch worden: één mail van een onbekende liet de hele server minutenlang stilstaan.
// Zuiver (geen database, geen netwerk): alleen shared/merk-eigen.ts en shared/merk-bron.ts.
import { checker } from './hulp/nep-google';
import { cssLaadtIets, ontsmetSvg, MERK_EIGEN_MAX_BYTES } from '../../shared/merk-eigen';
import { controleerBeeld, iconenUitHtml, MERK_BEELD_MAX_BYTES, MERK_EXTERN_SVG_MAX_BYTES, MERK_HTML_MAX_BYTES, formaatVan } from '../../shared/merk-bron';

const GRENS_MS = 200;
const vul = (stuk: string, bytes: number) => stuk.repeat(Math.max(0, Math.floor(bytes / stuk.length)));
const meet = <T>(fn: () => T): { ms: number; uit: T } => {
  const t = process.hrtime.bigint();
  const uit = fn();
  return { ms: Number(process.hrtime.bigint() - t) / 1e6, uit };
};

export async function main(): Promise<number> {
  const { check, einde } = checker('merk-bron-redos-20261112');
  // De grens voor een VREEMD logo (van buiten) en die voor een logo van de beheerder zelf.
  const extern = MERK_EXTERN_SVG_MAX_BYTES;
  const htmlMax = MERK_HTML_MAX_BYTES;

  // ---------------------------------------------------------------- 1. kwaadaardige SVG-lichamen op de grootte-grens
  // [naam, lichaam van n bytes, moet geweigerd worden?] — «false» = het bestand is toevallig geldig; dan telt alleen de tijd.
  const svgGevallen: Array<[string, (n: number) => string, boolean]> = [
    ["'<g ' × N", (n) => `<svg viewBox="0 0 1 1">${vul('<g ', n - 40)}</svg>`, true],
    ["'<g a' × N (attribuutnaam zonder waarde)", (n) => `<svg viewBox="0 0 1 1">${vul('<g a ', n - 40)}</svg>`, true],
    ["'<g a a a …' zonder «>»", (n) => `<svg viewBox="0 0 1 1"><g${vul(' a', n - 40)}</svg>`, true],
    ["'<!--' × N zonder einde", (n) => `<svg ${vul('<!--', n - 16)}`, true],
    ["'<!--' × N met </svg>", (n) => `<svg viewBox="0 0 1 1">${vul('<!--', n - 40)}</svg>`, true],
    ["'<metadata ' × N", (n) => `<svg viewBox="0 0 1 1">${vul('<metadata ', n - 40)}</svg>`, true],
    ["'<metadata></metadata ' × N (einde zonder «>»)", (n) => `<svg viewBox="0 0 1 1">${vul('<metadata></metadata ', n - 40)}</svg>`, true],
    ["'<sodipodi:namedview ' × N", (n) => `<svg viewBox="0 0 1 1">${vul('<sodipodi:namedview ', n - 40)}</svg>`, true],
    ["'<?xml' × N", (n) => `<svg viewBox="0 0 1 1">${vul('<?xml', n - 40)}</svg>`, true],
    ["<style> met '/*' × N", (n) => `<svg viewBox="0 0 1 1"><style>${vul('/*', n - 60)}</style></svg>`, false],
    ["<style> met '/* ' × N (commentaar zonder einde)", (n) => `<svg viewBox="0 0 1 1"><style>${vul('/* ', n - 60)}</style></svg>`, false],
    ["attribuut met '/* ' × N", (n) => `<svg viewBox="0 0 1 1"><g style="${vul('/* ', n - 60)}"/></svg>`, false],
    ["<style> met «url(» + spaties × N + «#a)»", (n) => `<svg viewBox="0 0 1 1"><style>a{fill:url(${' '.repeat(n - 80)}#a)}</style></svg>`, false],
    ["attribuut met «url(» + spaties × N + «#a)»", (n) => `<svg viewBox="0 0 1 1"><g fill="url(${' '.repeat(n - 80)}#a)"/></svg>`, false],
    ["<style> met 'url( ' × N", (n) => `<svg viewBox="0 0 1 1"><style>${vul('url( ', n - 60)}</style></svg>`, true],
    ["<style> met 'expression ' × N", (n) => `<svg viewBox="0 0 1 1"><style>${vul('expression ', n - 60)}</style></svg>`, false],
    ["'<g x=\"' × N", (n) => `<svg viewBox="0 0 1 1">${vul('<g x="', n - 40)}</svg>`, true],
    ["spaties × N in een tag", (n) => `<svg viewBox="0 0 1 1"><g${' '.repeat(n - 60)}</svg>`, true],
    ["'</svg ' × N", (n) => `<svg viewBox="0 0 1 1">${vul('</svg ', n - 40)}`, true],
    ["'\\\\' × N in <style>", (n) => `<svg viewBox="0 0 1 1"><style>${vul('\\', n - 60)}</style></svg>`, false],
    ["'&#' × N in <style>", (n) => `<svg viewBox="0 0 1 1"><style>${vul('&#', n - 60)}</style></svg>`, false],
    ["'&' + letters × N in <style>", (n) => `<svg viewBox="0 0 1 1"><style>${vul('&aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', n - 60)}</style></svg>`, false],
  ];
  for (const [naam, maak, weiger] of svgGevallen) {
    for (const [soort, max, fn] of [
      ['vreemd logo (controleerBeeld)', Math.min(extern, MERK_EIGEN_MAX_BYTES), (b: Buffer) => controleerBeeld(b)],
      ['eigen logo (ontsmetSvg, 200 KB)', MERK_EIGEN_MAX_BYTES, (b: Buffer) => ontsmetSvg(b)],
    ] as Array<[string, number, (b: Buffer) => { ok: boolean }]>) {
      const lichaam = Buffer.from(maak(max - 8));
      const { ms, uit } = meet(() => fn(lichaam));
      check(`integraties-01: ${soort}: ${naam} (${Math.round(lichaam.length / 1024)} KB) binnen ${GRENS_MS} ms${weiger ? ' en geweigerd' : ''}`, ms < GRENS_MS && (!weiger || uit.ok === false), `${ms.toFixed(0)} ms`);
    }
  }
  {
    const { ms, uit } = meet(() => controleerBeeld(Buffer.alloc(MERK_BEELD_MAX_BYTES - 1, '<svg viewBox="0 0 1 1"><g <g <g ')));
    check('integraties-01: een vreemd SVG op de volle bestandsgrens (256 KB) wordt snel geweigerd', ms < GRENS_MS && !uit.ok, `${ms.toFixed(0)} ms`);
  }
  {
    const { ms } = meet(() => cssLaadtIets(vul('/* ', 200 * 1024)));
    check("integraties-01: cssLaadtIets met '/* ' × N (200 KB) binnen de tijd", ms < GRENS_MS, `${ms.toFixed(0)} ms`);
    check('integraties-01: cssLaadtIets — verwijzingen binnen het bestand (#…) mogen, al het andere niet (zelfde uitkomst als voorheen)',
      !cssLaadtIets('fill:url(#g)') && !cssLaadtIets('fill:url( #g )') && !cssLaadtIets('fill:url("#g")') && !cssLaadtIets("fill:url(' #g')") && !cssLaadtIets('fill:URL (#g)')
      && cssLaadtIets('fill:url(https://x.example/a)') && cssLaadtIets('fill:url("https://x.example/a")') && cssLaadtIets('fill:url()') && cssLaadtIets('fill:url( x#g)')
      && cssLaadtIets('fill:u\\72l(https://x.example/a)') && cssLaadtIets('fill:&#117;rl(//x.example/a)') && cssLaadtIets('a{b:url(#g)} c{d:url(//x)}'));
    const { ms: ms2 } = meet(() => formaatVan(Buffer.from(vul('<!--', 2048))));
    check('integraties-01: formaatVan op een kop vol «<!--» binnen de tijd', ms2 < GRENS_MS, `${ms2.toFixed(0)} ms`);
  }

  // ---------------------------------------------------------------- 2. kwaadaardige HTML-pagina's
  const htmlGevallen: Array<[string, string]> = [
    ["'<link ' × N", vul('<link ', htmlMax)],
    ["'<link a=' × N", vul('<link a=', htmlMax)],
    ["'<link rel=\"' × N", vul('<link rel="', htmlMax)],
    ["'</head' × N", vul('</head', htmlMax)],
    ["'<link' + spaties × N", `<link${' '.repeat(htmlMax - 10)}`],
    ['één <link> met een attribuut van 250 KB', `<link rel="icon" href="/a.png" data-x="${'a'.repeat(htmlMax - 80)}">`],
    ['<link> + 3900 letters zonder «=» × N', vul(`<link ${'a'.repeat(3900)}>`, htmlMax)],
    ['<link> + «a=» × 1900 × N', vul(`<link ${'a='.repeat(1900)}>`, htmlMax)],
    ['20 000 geldige <link rel=icon>', vul('<link rel=icon href=/a.png>', htmlMax)],
  ];
  for (const [naam, html] of htmlGevallen) {
    const { ms } = meet(() => iconenUitHtml(html, 'https://a.example/'));
    check(`integraties-01: iconenUitHtml ${naam} (${Math.round(html.length / 1024)} KB) binnen ${GRENS_MS} ms`, ms < GRENS_MS, `${ms.toFixed(0)} ms`);
  }

  // ---------------------------------------------------------------- 3. geen regressie: gewone bestanden blijven werken
  {
    const goed = '<?xml version="1.0"?><!-- gemaakt met een editor --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
      + '<metadata><rdf:RDF>iets</rdf:RDF></metadata><sodipodi:namedview id="n"/><title>Logo</title><style>/* kleur */ .a{fill:#123}</style>'
      + '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs>'
      + '<g class="a" fill=\'url(#g)\'><path d="M0 0h24v24H0z"/><use href="#g"/></g></svg>';
    const u = ontsmetSvg(goed);
    const tekst = u.ok ? u.inhoud.toString('utf8') : '';
    check('integraties-01: een gewoon SVG wordt nog aanvaard en ontsmet (commentaar, metadata, editor-elementen weg)',
      u.ok && !/metadata|sodipodi|<!--|<\?xml/.test(tekst) && tekst.includes('<path d="M0 0h24v24H0z"/>') && tekst.includes('fill="url(#g)"') && tekst.includes('<title>Logo</title>'), u.ok ? '' : u.reden);
    const c = controleerBeeld(Buffer.from(goed));
    check('integraties-01: controleerBeeld aanvaardt hetzelfde bestand als vreemd logo', c.ok && c.mime === 'image/svg+xml');
    check('integraties-01: een SVG met script blijft geweigerd', (() => { const r = ontsmetSvg('<svg viewBox="0 0 1 1"><script>x</script></svg>'); return !r.ok && r.reden === 'ELEMENT_SCRIPT'; })());
    check('integraties-01: een attribuut met een ruwe «<» in de waarde wordt geweigerd (ongeldige XML), niet doorgelaten',
      ontsmetSvg('<svg viewBox="0 0 1 1"><g id="a<b"/></svg>').ok === false);
    check('integraties-01: een commentaar zonder einde wordt geweigerd', (() => { const r = ontsmetSvg('<svg viewBox="0 0 1 1"><!-- open</svg>'); return !r.ok; })());
    check('integraties-01: url() naar buiten in <style> achter een commentaar blijft geweigerd',
      (() => { const r = ontsmetSvg('<svg viewBox="0 0 1 1"><style>/* x */ .a{fill:url(https://kwaad.example/x)}</style></svg>'); return !r.ok && r.reden === 'STIJL_LAADT_IETS'; })());
    check('integraties-01: een CSS-commentaar dat een functie splitst (u/**/rl) omzeilt de controle niet',
      cssLaadtIets('@im/* */port "x"') === false && cssLaadtIets('/* a */@import "x"') === true && cssLaadtIets('fill:url(/* */https://x)') === true);
    const html = '<!doctype html><html><head><title>x</title><link rel="icon" href="/k.png" sizes="32x32"><link rel="apple-touch-icon" href="/groot.png" sizes="180x180">'
      + '<link rel="manifest" href="/site.webmanifest"><link rel=icon type=image/svg+xml href=/logo.svg></head><body><link rel="icon" href="/niet.png"></body></html>';
    const i = iconenUitHtml(html, 'https://voorbeeld.example/');
    check('integraties-01: iconenUitHtml leest gewone <link>-iconen en het manifest als voorheen',
      i.iconen.length === 3 && i.manifest === 'https://voorbeeld.example/site.webmanifest' && i.iconen.some((k) => k.url === 'https://voorbeeld.example/groot.png' && k.px === 180)
      && i.iconen.some((k) => k.url === 'https://voorbeeld.example/logo.svg' && k.px === 1024), JSON.stringify(i).slice(0, 200));
  }
  // De grens voor vreemde logo's is lager dan die voor eigen logo's (de beheerder kiest zijn bestand zelf).
  check('integraties-01: een vreemd SVG boven 64 KB wordt geweigerd (eigen logo: tot 200 KB)',
    extern <= 64 * 1024 && (() => {
      const groot = Buffer.from(`<svg viewBox="0 0 1 1">${vul('<g/>', 100 * 1024)}</svg>`);
      const r = controleerBeeld(groot);
      return !r.ok && r.reden === 'SVG_TE_GROOT' && ontsmetSvg(groot).ok === true;
    })());
  return einde();
}
