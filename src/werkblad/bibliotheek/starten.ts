// Starten van een snelkoppeling: altijd via de canonieke router, met een VERSE rechtencontrole op het moment van klikken.
import { canonicalNavigationUrl } from '../../canoniek-navigatie';
import { launchDoel, registerItem, toegestaanVoor, type RegisterContext, type RegisterRegel, type Toestemming } from '../../../shared/werkblad-register';

export type StartUitkomst = { ok: true; url: string } | { ok: false; toestemming: Toestemming };

/** Bepaalt het adres; navigeert NIET (testbaar). usr:-items lopen via hun basis-item. */
export function startAdres(item: RegisterRegel | undefined, ctx: RegisterContext, lang: 'uk' | 'nl', persoonlijk: readonly RegisterRegel[] = []): StartUitkomst {
  const t = toegestaanVoor(item, ctx);
  if (!t.ok) return { ok: false, toestemming: t };
  const basis = item?.basis ? registerItem(item.basis, persoonlijk) : item;
  const doel = launchDoel(basis, ctx);
  if (!doel) return { ok: false, toestemming: { ok: false, beschikbaarheid: 'denied', reden: { uk: 'Цей елемент не відкривається.', nl: 'Dit item kan niet worden geopend.' } } };
  const url = canonicalNavigationUrl(doel.dienst, doel.tab, lang);
  // actionId (cmd:) gaat mee als ?actie=… zodat de doelpagina later de juiste functie kan openen. Nu negeren de doelpagina's
  // dit nog (bekende beperking, RELEASE-NOTITIES): de opdracht opent de juiste sectie, voert NIETS uit.
  const item2 = item?.actionId ? item : basis;
  if (item2?.actionId) { try { const u = new URL(url, typeof location !== 'undefined' ? location.href : 'https://hub.invalid/'); u.searchParams.set('actie', item2.actionId); return { ok: true, url: u.toString() }; } catch { /* blijft zonder actie */ } }
  return { ok: true, url };
}

/** Start echt (location.assign). Geeft de uitkomst terug zodat de UI een weigering kan tonen. */
export function startItem(item: RegisterRegel | undefined, ctx: RegisterContext, lang: 'uk' | 'nl', persoonlijk: readonly RegisterRegel[] = [], navigeer: (url: string) => void = (u) => location.assign(u)): StartUitkomst {
  const u = startAdres(item, ctx, lang, persoonlijk);
  if (u.ok) navigeer(u.url);
  return u;
}
