// UI-015: één kaart = groot icoon/logo, naam, één regel uitleg of account, eerlijke status en ÉÉN hoofdactie.
// De hele kaart opent de details (zelfde uitkomst als «Керувати/Налаштувати/Переглянути»); «Повторити» laadt opnieuw;
// «Підключити» (alleen server-status gereed-om-te-koppelen) gaat naar de echte koppelflow (same-origin pad van de server).
import { ChevronRight, Lock, Plus, RefreshCw } from 'lucide-react';
import { tekstVan, type MethodeKaart, type Taal } from '../../shared/aanmeldmethoden-model';
import { MethodeIcoon } from './iconen';

const isAanbieder = (k: MethodeKaart) => k.id.startsWith('aanbieder:') || k.id === 'google';
export function staatLabel(k: MethodeKaart, lang: Taal): string {
  const tr = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  switch (k.staat) {
    case 'active': return isAanbieder(k) ? tr('Підключено', 'Gekoppeld') : tr('Увімкнено', 'Aan');
    case 'ready': return k.actie === 'connect' ? tr('Можна підключити', 'Kan gekoppeld worden') : tr('Не налаштовано', 'Niet ingesteld');
    case 'attention': return tekstVan(k.reden, lang) || tr('Потребує уваги', 'Vraagt aandacht');
    case 'not-configured': case 'unavailable': case 'unknown': return tekstVan(k.reden, lang) || tr('Стан не вдалося перевірити', 'Status kon niet worden gecontroleerd');
    default: return '';
  }
}
export function actieLabel(k: MethodeKaart, lang: Taal): string {
  const tr = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  return ({ manage: tr('Керувати', 'Beheren'), setup: tr('Налаштувати', 'Instellen'), connect: tr('Підключити', 'Koppelen'), view: tr('Переглянути', 'Bekijken'), retry: tr('Повторити', 'Opnieuw'), none: '' } as const)[k.actie];
}
const TOON: Record<string, string> = { active: 'goed', ready: 'info', attention: 'let', 'not-configured': 'stil', unavailable: 'stil', unknown: 'let', neutral: 'stil', loading: 'stil' };

export function IdentityMethodCard({ k, lang, compact, onOpen, onRetry }: { k: MethodeKaart; lang: Taal; compact?: boolean; onOpen: (k: MethodeKaart) => void; onRetry: () => void }) {
  const tr = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  const titel = k.titel[lang];
  if (k.staat === 'loading') return <article className='amv2-kaart laden' aria-busy='true' aria-label={`${titel}: ${tr('завантаження', 'laden')}`} data-kaart={k.id}>
    <MethodeIcoon icoon={k.icoon} /><div className='amv2-kaart-tekst'><strong>{titel}</strong><span className='amv2-skelet' /><span className='amv2-skelet kort' /></div></article>;
  const label = staatLabel(k, lang);
  const regel = k.accountLabel || (k.feit ? k.feit[lang] : '') || k.ondertitel[lang];
  const kanOpenen = k.staat !== 'unknown' || k.actie !== 'retry';
  const actie = actieLabel(k, lang);
  return <article className={`amv2-kaart staat-${k.staat}${compact ? ' compact' : ''}`} data-kaart={k.id} data-staat={k.staat} data-anker={k.anker || undefined}>
    {kanOpenen && <button type='button' className='amv2-kaart-open' onClick={() => onOpen(k)} aria-label={tr(`Деталі: ${titel}`, `Details: ${titel}`)} aria-haspopup='dialog' />}
    <MethodeIcoon icoon={k.icoon} groot={!compact} />
    <div className='amv2-kaart-tekst'>
      <strong className='amv2-kaart-titel'>{titel}</strong>
      <span className='amv2-kaart-regel' title={regel}>{regel}</span>
      {label && <span className={`amv2-status toon-${TOON[k.staat]}`} data-status={k.staat}>{k.beschermd && k.staat === 'active' ? <Lock aria-hidden='true' /> : <i aria-hidden='true' />}{label}</span>}
    </div>
    {k.actie === 'retry' ? <button type='button' className='amv2-actie' onClick={onRetry}><RefreshCw aria-hidden='true' /><span>{actie}</span></button>
      : k.actie === 'connect' && k.koppelUrl ? <a className='amv2-actie hoofd' href={k.koppelUrl}><Plus aria-hidden='true' /><span>{actie}</span></a>
      : k.actie !== 'none' ? <button type='button' className={`amv2-actie${k.actie === 'setup' ? ' hoofd' : ''}`} onClick={() => onOpen(k)} aria-haspopup='dialog'>{k.actie === 'setup' ? <Plus aria-hidden='true' /> : <ChevronRight aria-hidden='true' />}<span>{actie}</span></button>
      : null}
  </article>;
}
