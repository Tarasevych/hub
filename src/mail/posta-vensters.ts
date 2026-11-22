// POSTA-VENSTERS-HERSTEL v1 (Grok: hub.tarasevych.com) — herstel van de bijlageviewer en het zwevende leesvenster.
// Alles hangt aan één vlag, standaard UIT (migratie 0308). Met de vlag uit verandert er niets: het attribuut op <html> ontbreekt,
// dus geen enkele CSS-regel uit posta-vensters.css geldt, de geschiedenis krijgt geen extra stap en de JOSE-test blijft de oude.
// De CSS (posta-vensters.css) wordt in src/GoogleMailWerkruimte.tsx geladen, zodat deze module ook in de eenheidstests werkt.

export const POSTA_VENSTERS_VLAG = 'posta-vensters-herstel-v1';
/** Attribuut op <html> zolang de vlag aan is; alle CSS van dit pakket hangt eraan. */
export const POSTA_VENSTERS_ATTR = 'data-posta-vensters-herstel';
/** Sleutel in history.state voor de eigen stap van de bijlageviewer («Назад» sluit eerst de viewer, dan pas de brief). */
export const BIJLAGE_STAP = 'mrBijlageStap';

type Staat = Record<string, unknown> | null | undefined;
export const bijlageStapBoven = (staat: Staat) => Boolean(staat && typeof staat === 'object' && (staat as Record<string, unknown>)[BIJLAGE_STAP]);
/** De nieuwe staat vult de bestaande aan (zoals in src/mail/LeesVenster.tsx): de stap van de brief blijft eronder bewaard. */
export const metBijlageStap = (staat: Staat): Record<string, unknown> => ({ ...((staat && typeof staat === 'object' ? staat : {}) as Record<string, unknown>), [BIJLAGE_STAP]: '1' });

/** Eén eigen geschiedenisstap zolang de viewer open (en niet geminimaliseerd) is. Geeft de opruimfunctie terug. */
export function bijlageStapInstalleren(sluit: () => void, h: History = history, w: Window = window): () => void {
  let eigen = false;
  try { h.pushState(metBijlageStap(h.state as Staat), ''); eigen = true; } catch { /* geen geschiedenis: niets te doen */ }
  const opTerug = () => { if (eigen && !bijlageStapBoven(h.state as Staat)) { eigen = false; sluit(); } };
  w.addEventListener('popstate', opTerug);
  return () => {
    w.removeEventListener('popstate', opTerug);
    // gesloten via knop of Escape: de eigen stap weghalen; de popstate die volgt ziet de brief nog boven (die stap ligt eronder)
    if (eigen && bijlageStapBoven(h.state as Staat)) { eigen = false; try { h.back(); } catch { /* */ } }
  };
}

/** Het element dat de viewer opende (de kaart van de bijlage); buiten de viewer zelf. */
export const buitenViewer = (el: Element | null): el is HTMLElement =>
  !!el && typeof (el as HTMLElement).focus === 'function' && el !== document.body && !el.closest('.google-mail-attachment-backdrop, .google-mail-attachment-preview');
