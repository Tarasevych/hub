// Laden van technische bundels (dist/assets/tech/, shared/tech-bundels.ts). De server geeft ze alleen met een geldige toegangscookie
// van een actieve technische activering (backend/tech-bundels.ts); anders 404. Dat kan gebeuren als de activering intussen is
// verlopen of beëindigd, of als een ander tabblad de cookie heeft vervangen (bv. een activering in een ander tabblad die al stopte).
//
// `lazyTech`: zoals React.lazy, maar bij een mislukte lading eerst de technische status vernieuwen (dat geeft een nieuwe cookie als
// de activering in DIT tabblad nog loopt) en één keer opnieuw proberen. Lukt dat niet, dan toont `TechBundelGrens` een duidelijke
// melding met «Оновити сторінку» in plaats van een witte pagina. Bewust NIET technisch (staat in src/tech/): nodig vóór de bundel.
import { Component, lazy, type ComponentType, type ReactNode } from 'react';
import { techActief, techVernieuwen } from './tech-opslag';

export const isBundelFout = (e: unknown) => /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch|ChunkLoadError|Unable to preload CSS|TECH_BUNDEL/i.test(String((e as Error)?.message || e || ''));

export function lazyTech<T extends ComponentType<any>>(laad: () => Promise<{ default: T }>, vernieuw: () => Promise<void> = techVernieuwen) {
  return lazy(async () => {
    try { return await laad(); }
    catch (e) {
      if (!isBundelFout(e)) throw e;
      try { await vernieuw(); } catch { /* status niet bereikbaar: hieronder volgt de melding */ }
      if (!techActief()) throw new Error('TECH_BUNDEL_NIET_ACTIEF');
      try { return await laad(); } catch { throw new Error('TECH_BUNDEL_GEWEIGERD'); }
    }
  });
}

let gemeld = false;
type Props = { lang?: 'uk' | 'nl'; children: ReactNode; compact?: boolean };
export class TechBundelGrens extends Component<Props, { fout: string }> {
  state = { fout: '' };
  static getDerivedStateFromError(e: unknown) { return { fout: String((e as Error)?.message || e || 'FOUT') }; }
  // De storing aan de server melden (29.10.2026): telt mee in de grafieken op admin.* en komt in het journaal. Eén keer per pagina.
  componentDidCatch(e: unknown) {
    const m = String((e as Error)?.message || e || '');
    if (!isBundelFout(m) || gemeld) return;
    gemeld = true;
    meldStoring(m.includes('NIET_ACTIEF') ? 'NIET_ACTIEF' : m.includes('GEWEIGERD') ? 'GEWEIGERD' : 'LADEN_MISLUKT');
  }
  render() {
    if (!this.state.fout) return this.props.children;
    if (!isBundelFout(this.state.fout)) throw new Error(this.state.fout);
    const uk = (this.props.lang || (document.documentElement.lang === 'nl' ? 'nl' : 'uk')) === 'uk';
    const nietActief = this.state.fout.includes('NIET_ACTIEF');
    return (
      <section className='tech-poort' role='alert' data-tech-bundel='fout'>
        <h2>{uk ? 'Технічні модулі не завантажено' : 'Technische onderdelen niet geladen'}</h2>
        <p>{nietActief
          ? (uk ? 'Технічний профіль у цій вкладці вже не активний (завершився, сплив час або його вимкнено в іншій вкладці). Увімкніть його знову або оновіть сторінку.'
                : 'Het technisch profiel is in dit tabblad niet meer actief (beëindigd, verlopen of in een ander tabblad uitgezet). Zet het opnieuw aan of vernieuw de pagina.')
          : (uk ? 'Сервер не віддав технічні модулі для цієї вкладки. Найчастіше профіль змінено в іншій вкладці — оновіть сторінку.'
                : 'De server gaf de technische onderdelen niet voor dit tabblad. Meestal is het profiel in een ander tabblad gewijzigd — vernieuw de pagina.')}</p>
        <div className='tech-poort-knoppen'>
          <button type='button' className='is-hoofd' onClick={() => location.reload()}>{uk ? 'Оновити сторінку' : 'Pagina vernieuwen'}</button>
        </div>
      </section>
    );
  }
}

/** Stuurt de soort storing naar de server (POST /api/storing/tech-bundel); faalt stil, mag nooit iets breken. */
export function meldStoring(soort: string) {
  try { void fetch('/api/storing/tech-bundel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soort }), keepalive: true, credentials: 'same-origin' }).catch(() => undefined); } catch { /* niets */ }
}
