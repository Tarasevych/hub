// IDENTITEIT-015 (C2): чи це сторінка повернення від Google (id.*/?state=v2.…&code=…). Там ще немає сесійного контексту вкладки,
// тож запити, що вимагають сесії (прапорці тощо), дають 401 і одразу губляться — сторінка переходить далі. Чиста функція без DOM.
// Is dit de terugkeerpagina van Google? Daar nog geen tabcontext: sessieverzoeken (vlaggen) gaven een nutteloze 401.
export const GOOGLE_STATE_RE = /^(?:v2|mailg\.v1|mailm\.v1|cloudg\.v1|gsuite\.v2)\./;

export const opGoogleTerugkeer = (zoek = typeof location === 'undefined' ? '' : location.search): boolean => {
  const q = new URLSearchParams(zoek);
  return GOOGLE_STATE_RE.test(q.get('state') || '') && (q.has('code') || q.has('error'));
};
