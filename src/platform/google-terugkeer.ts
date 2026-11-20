// IDENTITEIT-015 (C2): чи це сторінка повернення від Google (id.*/?state=v2.…&code=…). Там ще немає сесійного контексту вкладки,
// тож запити, що вимагають сесії (прапорці тощо), дають 401 і одразу губляться — сторінка переходить далі. Чиста функція без DOM.
// Is dit de terugkeerpagina van Google? Daar nog geen tabcontext: sessieverzoeken (vlaggen) gaven een nutteloze 401.
export const GOOGLE_STATE_RE = /^(?:v2|mailg\.v1|mailm\.v1|cloudg\.v1|gsuite\.v2)\./;

// Обробник повернення (src/EigenaarIdentiteitTerug.tsx) одразу прибирає ?state=…&code=… з адреси (history.replaceState), тож він
// ставить позначку на вікні ДО цього; сторінка після входу завантажується заново, і позначки там уже немає.
// De callback-handler wist de query meteen; daarom zet hij vooraf een markering op het venster.
const MARKERING = '__mrGoogleTerugkeer';
export const markeerGoogleTerugkeer = (): void => { try { (globalThis as Record<string, unknown>)[MARKERING] = true; } catch { /* negeren */ } };
export const opGoogleTerugkeer = (zoek?: string): boolean => {
  if (zoek === undefined && (globalThis as Record<string, unknown>)[MARKERING] === true) return true;
  const q = new URLSearchParams(zoek ?? (typeof location === 'undefined' ? '' : location.search));
  return GOOGLE_STATE_RE.test(q.get('state') || '') && (q.has('code') || q.has('error'));
};
