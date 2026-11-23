// Віха M2 (UI-015A): картка окремого способу входу (рядкова в основній сітці або компактна плитка в «Доступних»).
// Зберігає канонічні якорі id={k.anker}, текстові мітки станів та захист останнього способу входу.
import { ChevronRight, Lock, Plus, RefreshCw } from 'lucide-react';
import { actieLabel, staatLabel, type MethodeKaart, type Taal } from './aanmeldmethoden-model';
import { MethodeIcoon } from './iconen';

const TOON: Record<string, string> = {
  active: 'goed',
  ready: 'info',
  attention: 'let',
  'not-configured': 'stil',
  unavailable: 'stil',
  unknown: 'let',
  neutral: 'stil',
  loading: 'stil',
};

export function MethodeKaartV2({
  k,
  lang,
  compact,
  onOpen,
  onRetry,
  onConnect,
}: {
  k: MethodeKaart;
  lang: Taal;
  compact?: boolean;
  onOpen: (k: MethodeKaart) => void;
  onRetry: () => void;
  onConnect?: (k: MethodeKaart) => void;
}) {
  const tr = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  const titel = k.titel[lang];

  if (k.staat === 'loading') {
    return (
      <article
        className='amv2-kaart laden'
        id={k.anker || undefined}
        aria-busy='true'
        aria-label={`${titel}: ${tr('завантаження', 'laden')}`}
        data-kaart={k.id}
      >
        <MethodeIcoon icoon={k.icoon} />
        <div className='amv2-kaart-tekst'>
          <strong>{titel}</strong>
          <span className='amv2-skelet' />
          <span className='amv2-skelet kort' />
        </div>
      </article>
    );
  }

  const label = staatLabel(k, lang);
  const regel = k.accountLabel || (k.feit ? k.feit[lang] : '') || k.ondertitel[lang];
  const kanOpenen = k.staat !== 'unknown' || k.actie !== 'retry';
  const actie = actieLabel(k, lang);

  return (
    <article
      className={`amv2-kaart staat-${k.staat}${compact ? ' compact' : ''}`}
      id={k.anker || undefined}
      data-kaart={k.id}
      data-staat={k.staat}
      data-anker={k.anker || undefined}
    >
      {kanOpenen ? (
        <button
          type='button'
          className='amv2-kaart-open'
          onClick={() => onOpen(k)}
          aria-label={tr(`Подробиці: ${titel}`, `Gegevens: ${titel}`)}
          aria-haspopup='dialog'
        />
      ) : null}
      <MethodeIcoon icoon={k.icoon} groot={!compact} />
      <div className='amv2-kaart-tekst'>
        <strong className='amv2-kaart-titel'>{titel}</strong>
        <span className='amv2-kaart-regel' title={regel}>
          {regel}
        </span>
        {label ? (
          <span className={`amv2-status toon-${TOON[k.staat] || 'stil'}`} data-status={k.staat}>
            {k.beschermd && k.staat === 'active' ? <Lock aria-hidden='true' /> : <i aria-hidden='true' />}
            {label}
          </span>
        ) : null}
      </div>
      {k.actie === 'retry' ? (
        <button type='button' className='amv2-actie' onClick={onRetry}>
          <RefreshCw aria-hidden='true' />
          <span>{actie}</span>
        </button>
      ) : k.actie === 'connect' && k.koppelUrl ? (
        onConnect ? (
          <button type='button' className='amv2-actie hoofd' onClick={() => onConnect(k)}>
            <Plus aria-hidden='true' />
            <span>{actie}</span>
          </button>
        ) : (
          <a className='amv2-actie hoofd' href={k.koppelUrl}>
            <Plus aria-hidden='true' />
            <span>{actie}</span>
          </a>
        )
      ) : k.actie !== 'none' ? (
        <button
          type='button'
          className={`amv2-actie${k.actie === 'setup' ? ' hoofd' : ''}`}
          onClick={() => onOpen(k)}
          aria-haspopup='dialog'
        >
          {k.actie === 'setup' ? <Plus aria-hidden='true' /> : <ChevronRight aria-hidden='true' />}
          <span>{actie}</span>
        </button>
      ) : null}
    </article>
  );
}
