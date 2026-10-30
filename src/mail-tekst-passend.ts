// Passend maken van HTML-mail in het leeskader (mobiele pass 19.10.2026).
// Nieuwsbrieven hebben vaak vaste breedtes (tabellen van 600–800 px, width-attributen, min-width). In een smal kader werd die
// inhoud afgekapt (body overflow-x:hidden). Nu: natuurlijke breedte meten en, als die breder is dan het kader, de hele brief
// binnen het kader verkleinen (transform: scale, layout blijft gelijk). Met «Оригінальний розмір» blijft de brief op ware grootte
// en scrolt alleen het mailkader zelf horizontaal — nooit de pagina.

export type MailBodyPassing = { breed: boolean; schaal: number; natuur: number; hoogte: number };

/** Kleinste verkleining; daaronder wordt tekst onleesbaar en is «Оригінальний розмір» de betere keuze. */
export const MAIL_BODY_MIN_SCHAAL = 0.3;

/** Zuivere rekenregel: schaal om `natuur` px in `beschikbaar` px te laten passen (1 = past al; 0 = te breed, dan scrollen). */
export function mailBodySchaal(natuur: number, beschikbaar: number): number {
  if (!(natuur > 0) || !(beschikbaar > 0) || natuur <= beschikbaar + 1) return 1;
  const s = Math.floor((beschikbaar / natuur) * 1000) / 1000;
  return s < MAIL_BODY_MIN_SCHAAL ? 0 : s;
}

/**
 * Inhoudshoogte van het maildocument, onafhankelijk van de hoogte van het iframe. `scrollHeight` van html/body is in een iframe
 * minstens de viewport-hoogte (clientHeight) en is dus ongeschikt: iframe-hoogte = scrollHeight + 2 → scrollHeight groeit mee → lus.
 * Gemeten wordt de lay-outhoogte (offsetHeight van html en body, incl. doorgezakte marges) en de onderkant van de kinderen van
 * body (floats/absoluut gepositioneerde inhoud geeft html/body offsetHeight 0).
 */
export function mailDocumentHoogte(doc: Document): number {
  const body = doc.body, html = doc.documentElement;
  if (!body || !html) return 0;
  const rect = (el: Element) => (typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null);
  const top = rect(html)?.top ?? 0;
  let hoogte = Math.max(html.offsetHeight || 0, body.offsetHeight || 0);
  for (const kind of Array.from(body.children || [])) {
    const r = rect(kind);
    if (r && r.height > 0) hoogte = Math.max(hoogte, r.bottom - top);
  }
  return Math.ceil(Math.max(0, hoogte));
}

/** Tekstgrootte («Вигляд», pakket 2): de brief wordt op `beschikbaar / tekst` px opgemaakt en daarna ×tekst getoond — tekst en
 *  beelden worden groter of kleiner, de regels lopen opnieuw, en de brief blijft precies even breed als het kader. Past de inhoud
 *  daar niet in (vaste breedte van een nieuwsbrief), dan zo groot als het kader toelaat (nooit groter dan gevraagd). */
export function tekstSchaal(natuur: number, breedte: number, beschikbaar: number, tekst: number): number {
  if (!(natuur > breedte + 1)) return tekst;
  const s = Math.floor((beschikbaar / natuur) * 1000) / 1000;
  return Math.min(tekst, s);
}

/**
 * Past het document in het iframe aan het kader aan en geeft de benodigde iframe-hoogte terug.
 * Eerst alles terugzetten en de natuurlijke breedte meten (geen paint ertussen), dan pas schalen of horizontaal scrollen.
 * `tekst` = tekstgrootte (1 = 100 %); in «Оригінальний розмір» telt die niet (ware grootte is ware grootte).
 */
export function pasMailDocumentAan(doc: Document, beschikbaar: number, origineel: boolean, tekst = 1): MailBodyPassing {
  const body = doc.body, html = doc.documentElement;
  if (!body || !html) return { breed: false, schaal: 1, natuur: 0, hoogte: 0 };
  body.style.transform = ''; body.style.transformOrigin = ''; body.style.width = ''; body.style.maxWidth = '100%'; body.style.overflow = ''; body.style.overflowX = 'hidden';
  html.style.overflow = '';
  // Hoogte mag nooit van de iframe-viewport afhangen (html/body height:100% of min-height uit de mail), anders meet elke
  // vergroting van het kader zichzelf terug (F8: groeilus 906→1034→…→8400 px).
  html.style.height = 'auto'; html.style.minHeight = '0'; body.style.height = 'auto'; body.style.minHeight = '0';
  const hoogteNu = () => mailDocumentHoogte(doc);
  const k = Number.isFinite(tekst) && tekst > 0 ? tekst : 1;
  if (k !== 1 && !origineel && beschikbaar > 0) {
    // srcdoc-documenten zijn nooit in quirks mode: scrollWidth van <body> is daar de inhoud met overloop (niet het venster)
    const breedte = Math.max(1, Math.floor(beschikbaar / k));
    body.style.maxWidth = 'none'; body.style.width = `${breedte}px`;
    const natuur = Math.ceil(body.scrollWidth);
    const s = tekstSchaal(natuur, breedte, beschikbaar, k);
    if (s >= MAIL_BODY_MIN_SCHAAL) {
      if (natuur > breedte + 1) body.style.width = `${natuur}px`;
      body.style.overflow = 'hidden'; html.style.overflow = 'hidden';
      const hoogte = hoogteNu();
      body.style.transformOrigin = '0 0';
      body.style.transform = `scale(${s})`;
      // «зменшено»-balk alleen als de brief kleiner staat dan de eigenaar vroeg omdat hij te breed is
      return { breed: natuur > breedte + 1 && s < Math.min(1, k), schaal: s, natuur, hoogte: Math.ceil(hoogte * s) };
    }
    body.style.width = ''; body.style.maxWidth = '100%';
  }
  const natuur = Math.ceil(Math.max(body.scrollWidth, html.scrollWidth));
  const schaal = mailBodySchaal(natuur, beschikbaar);
  if (schaal === 1) return { breed: false, schaal: 1, natuur, hoogte: hoogteNu() };
  if (origineel || schaal === 0) {
    // Ware grootte: het kader (iframe-viewport) scrolt horizontaal; +18 px voor een klassieke schuifbalk.
    body.style.overflowX = 'auto';
    return { breed: true, schaal: 1, natuur, hoogte: hoogteNu() + 18 };
  }
  body.style.maxWidth = 'none';
  body.style.width = `${natuur}px`;
  body.style.overflow = 'hidden';
  html.style.overflow = 'hidden';
  const hoogte = hoogteNu();
  body.style.transformOrigin = '0 0';
  body.style.transform = `scale(${schaal})`;
  return { breed: true, schaal, natuur, hoogte: Math.ceil(hoogte * schaal) };
}
