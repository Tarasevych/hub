// SEC-002 (aanv-ronde1-01): «Друк» вкладення відкривав СИРИЙ blob верхнім рівнем — із типом, який заявив відправник
// (text/html, image/svg+xml …). Такий документ має походження застосунку: розмітка нападника (форма, meta refresh)
// працювала під адресою сайту й могла одним кліком надіслати автентифікований POST на /api/*.
// Тепер друк ніколи не відкриває сирий вміст: PDF — Blob із ПРИМУСОВИМ типом application/pdf (HTML у ньому не виконується),
// растрові зображення й текст — власний безпечний документ із суворою CSP (екранований текст або <img>), решта — не друкується.

export type AfdrukSoort = 'pdf' | 'beeld' | 'tekst' | 'geen';
export type AfdrukBron = { contentType?: string; blobType?: string; kind?: string; filename?: string; text?: string };

const RASTER = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/pjpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/avif']);
const RASTER_EXT = /\.(?:png|jpe?g|gif|webp|bmp|avif)$/i;
/** Типи, які браузер виконує як документ: їх ніколи не відкриваємо верхнім рівнем і не беремо за «зображення». */
const ACTIEF = /(?:html|xml|xsl|svg|javascript|ecmascript|x-shockwave|multipart\/related)/i;

const basisType = (v?: string) => String(v || '').split(';')[0].trim().toLowerCase();

/** Як безпечно друкувати це вкладення. Вирішує лише за типом/розширенням — вміст у будь-якому разі не стає активним. */
export function afdrukSoort(bron: AfdrukBron): AfdrukSoort {
  const typen = [basisType(bron.contentType), basisType(bron.blobType)].filter(Boolean);
  const naam = String(bron.filename || '');
  if (typen.some((t) => ACTIEF.test(t)) || /\.(?:x?html?|svgz?|xml|xslt?|mht(?:ml)?|shtml)$/i.test(naam)) {
    // Активний тип: лише як екранований текст (якщо перегляд уже має текст), інакше — не друкувати.
    return bron.text ? 'tekst' : 'geen';
  }
  if (typen.includes('application/pdf') || bron.kind === 'pdf') return 'pdf';
  if (typen.some((t) => RASTER.has(t)) || (bron.kind === 'image' && RASTER_EXT.test(naam))) return 'beeld';
  if (bron.text) return 'tekst';
  return 'geen';
}

const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Безпечний документ для друку: жодних скриптів, форм, переходів; лише екранований текст або одне зображення з blob:. */
export function afdrukDocument(soort: 'beeld' | 'tekst', titel: string, waarde: string): string {
  const csp = soort === 'beeld'
    ? "default-src 'none'; img-src blob:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"
    : "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'";
  const lichaam = soort === 'beeld'
    ? (/^blob:/.test(waarde) ? `<img src="${escapeHtml(waarde)}" alt="">` : '')
    : `<pre>${escapeHtml(waarde)}</pre>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><title>${escapeHtml(titel.slice(0, 200))}</title><style>body{margin:16px;font:12px/1.4 monospace}img{max-width:100%}pre{white-space:pre-wrap;word-break:break-word}</style></head><body>${lichaam}</body></html>`;
}

/**
 * Готує URL для друку. Повертає null, коли цей тип не друкується. `maakUrl` — URL.createObjectURL (підмінюється в тестах).
 * Сирий blob вкладення верхнім рівнем не відкривається НІКОЛИ: завжди новий Blob із типом, який визначили ми.
 */
export async function afdrukUrl(bron: AfdrukBron & { blob: Blob }, maakUrl: (b: Blob) => string = (b) => URL.createObjectURL(b)): Promise<{ url: string; soort: AfdrukSoort } | null> {
  const soort = afdrukSoort(bron);
  if (soort === 'geen') return null;
  if (soort === 'pdf') return { url: maakUrl(new Blob([await bron.blob.arrayBuffer()], { type: 'application/pdf' })), soort };
  if (soort === 'beeld') {
    const type = RASTER.has(basisType(bron.blobType)) ? basisType(bron.blobType) : RASTER.has(basisType(bron.contentType)) ? basisType(bron.contentType) : 'image/png';
    const beeld = maakUrl(new Blob([await bron.blob.arrayBuffer()], { type }));
    return { url: maakUrl(new Blob([afdrukDocument('beeld', String(bron.filename || ''), beeld)], { type: 'text/html' })), soort };
  }
  return { url: maakUrl(new Blob([afdrukDocument('tekst', String(bron.filename || ''), String(bron.text || '').slice(0, 2_000_000))], { type: 'text/html' })), soort };
}
