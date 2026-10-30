// Snelkoppeling op het werkblad (Werkblad v3, kind 'shortcut'): icoon, naam, badge, accent van de herkomstdienst.
// Opent via de canonieke router met een verse rechtencontrole bij de klik; planned/denied tonen de reden en openen niets.
import { useState } from 'react';
import { registerItem, toegestaanVoor, type RegisterContext, type RegisterRegel } from '../../../shared/werkblad-register';
import { RegisterIcoon } from './icoon';
import { startItem } from './starten';
import { accentStijl, useRegisterBadge } from './tegels';
import { tr, type Lang } from '../soorten';
import './bibliotheek.css';

export type ShortcutTegelProps = {
  itemId: string; lang: Lang; ctx: RegisterContext; donker?: boolean;
  titleOverride?: string; iconOverride?: string; persoonlijk?: readonly RegisterRegel[];
  /** In instelmodus opent een klik niets (het canvas gebruikt de tegel dan om te slepen/kiezen). */
  instellen?: boolean;
  navigeer?: (url: string) => void;
};

export function ShortcutTegel(p: ShortcutTegelProps) {
  const item = registerItem(p.itemId, p.persoonlijk);
  const badge = useRegisterBadge(item?.basis ?? item?.id);
  const [melding, setMelding] = useState('');
  const t = toegestaanVoor(item, p.ctx);
  const titel = p.titleOverride || (item ? item.titel[p.lang] : p.itemId);
  const icoon = p.iconOverride || item?.icoon || 'dot';
  const uit = !t.ok;
  const klik = () => {
    if (p.instellen) return;
    const u = startItem(item, p.ctx, p.lang, p.persoonlijk, p.navigeer);
    if (!u.ok) setMelding(u.toestemming.ok ? '' : u.toestemming.reden[p.lang]);
  };
  const reden = !t.ok ? t.reden[p.lang] : '';
  return (
    <button type='button' className={`bib-tegel${uit ? ' bib-uit' : ''}`} style={accentStijl(item?.accent, !!p.donker)} onClick={klik}
      aria-disabled={uit || undefined} data-werkblad-item={p.itemId}
      aria-label={`${titel}${badge ? `, ${tr(p.lang, `${badge} непрочитаних`, `${badge} ongelezen`)}` : ''}${reden ? ` — ${reden}` : ''}`} title={reden || titel}>
      <span className='bib-tegel-icoon'><RegisterIcoon icoon={icoon} />{badge > 0 && <span className='bib-badge' aria-hidden='true'>{badge > 99 ? '99+' : badge}</span>}</span>
      <span className='bib-tegel-naam'>{titel}</span>
      {uit && <span className='bib-tegel-stand'>{t.ok ? '' : t.beschikbaarheid === 'planned' ? tr(p.lang, 'скоро', 'binnenkort') : tr(p.lang, 'недоступно', 'geen toegang')}</span>}
      {melding && <span className='bib-sr' role='status'>{melding}</span>}
    </button>
  );
}
