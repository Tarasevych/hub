// SITE-001 (28.11.2026) — Вбудована картка вибору способу входу для меню облікових записів (AccountMenuV3 та CanoniekAccountMenu).
// Коли користувач у меню облікових записів (як до входу, так і після входу) натискає кружечок «+»,
// «Увійти в обліковий запис» або «Увійти в інший обліковий запис», замість примусового перенаправлення
// лише на Google розгортається ця картка з усіма доступними на сайті способами входу (Google, Telegram,
// активні способи без Google та розкривний перелік «Інші способи входу» + прапорець збереження на пристрої),
// аналогічно до головної сторінки входу.
// NL: Ingebouwde aanmeldmethode-keuzekaart voor het accountmenu (AccountMenuV3 en CanoniekAccountMenu).
import { Fragment, useEffect, useRef, useState } from 'react';
import { ArrowRight, KeyRound, X } from 'lucide-react';
import { aanmeldIndeling } from '../../shared/aanmeld-plaatsing/plaatsing';
import AanmeldAndereOpties from '../AanmeldAndereOpties';
import { leesAanmeldenOnthouden, zetAanmeldenOnthouden } from '../aanmelden-onthouden';
import { GOOGLE_G_DATA_URI } from '../merk/google-g-officieel';
import AanmeldTelegram from '../telegram-aanmelden/AanmeldTelegram';
import { useAanmeldConfig } from '../telegram-aanmelden/aanmeld-config';
import AanmeldZonderGoogle, { ZONDER_GOOGLE, type ZonderGoogleId } from './AanmeldZonderGoogle';
import './aanmeld-keuze-paneel.css';

type Lang = 'uk' | 'nl';

export type AanmeldKeuzePaneelProps = {
  lang: Lang;
  intent: 'login' | 'replace-tab';
  titel?: string;
  busy?: boolean;
  onGoogle: () => void;
  onSluit?: () => void;
};

export default function AanmeldKeuzePaneel({
  lang,
  intent,
  titel,
  busy = false,
  onGoogle,
  onSluit,
}: AanmeldKeuzePaneelProps) {
  const uk = lang === 'uk';
  const aanmeldCfg = useAanmeldConfig();
  const indeling = aanmeldIndeling(aanmeldCfg);
  const [rememberBrowser, setRememberBrowser] = useState<boolean>(leesAanmeldenOnthouden);
  const kaartRef = useRef<HTMLElement | null>(null);

  const kiesOnthouden = (waarde: boolean) => {
    setRememberBrowser(zetAanmeldenOnthouden(waarde));
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const raf = window.requestAnimationFrame(() => {
      const kaart = kaartRef.current;
      if (!kaart) return;
      const paneel = kaart.closest('.canonical-account-panel') as HTMLElement | null;
      if (!paneel) return;
      const paneelRect = paneel.getBoundingClientRect();
      const kaartRect = kaart.getBoundingClientRect();
      const vensterHoogte = window.innerHeight || paneel.clientHeight || 0;
      const zichtbareOnderkant = Math.min(vensterHoogte - 12, paneelRect.bottom - 10);
      if (kaartRect.bottom > zichtbareOnderkant) {
        const nodig = kaartRect.bottom - zichtbareOnderkant;
        const bovenGrens = Math.max(12, kaartRect.top - Math.max(0, paneelRect.top) - 12);
        const delta = Math.max(0, Math.min(bovenGrens, nodig));
        if (delta > 4) {
          const minderBeweging =
            typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (typeof paneel.scrollBy === 'function') {
            paneel.scrollBy({ top: delta, behavior: minderBeweging ? 'auto' : 'smooth' });
          } else {
            paneel.scrollTop += delta;
          }
        }
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, []);

  const werkendZonderGoogle = (Array.isArray(aanmeldCfg?.methoden) ? aanmeldCfg!.methoden : []).filter((m) =>
    (ZONDER_GOOGLE as readonly string[]).includes(m),
  );
  const googleG = (
    <img src={GOOGLE_G_DATA_URI} alt='' width={18} height={18} draggable={false} data-merk-officieel='google' />
  );
  const zichtbareHoofd = indeling.hoofd.filter(
    (m) => m === 'google' || (m === 'telegram' && Boolean(aanmeldCfg?.zichtbaar)) || werkendZonderGoogle.includes(m),
  );
  const eersteHoofdMethode = zichtbareHoofd[0] || 'google';

  const maakGoogleKnop = (isHoofd: boolean) => (
    <button
      type='button'
      className='mr-sign-in-main-button am3-keuze-google-knop'
      data-hoofdactie={isHoofd ? 'true' : 'false'}
      disabled={busy || undefined}
      onClick={onGoogle}
    >
      <span className='mr-sign-in-logo' aria-hidden='true'>
        {googleG}
      </span>
      <span className='mr-sign-in-main-tekst'>{uk ? 'Увійти через Google' : 'Aanmelden met Google'}</span>
      <span className='mr-sign-in-arrow' aria-hidden='true'>
        <ArrowRight aria-hidden='true' />
      </span>
    </button>
  );

  const kopTitel =
    titel ||
    (intent === 'replace-tab'
      ? uk
        ? 'Оберіть спосіб входу в інший обліковий запис'
        : 'Kies een aanmeldmethode voor een ander account'
      : uk
        ? 'Оберіть спосіб входу'
        : 'Kies een aanmeldmethode');

  return (
    <section
      ref={kaartRef}
      className='am3-aanmeld-keuze canonical-signed-out mr-sign-in'
      data-account-aanmeld-keuze='open'
      data-aanmeld-intent={intent}
      aria-label={kopTitel}
    >
      <div className='am3-aanmeld-keuze-kop'>
        <span className='am3-aanmeld-keuze-titel'>
          <KeyRound aria-hidden='true' />
          <span>{kopTitel}</span>
        </span>
        {onSluit ? (
          <button
            type='button'
            className='am3-tray-close am3-aanmeld-keuze-sluit'
            aria-label={uk ? 'Згорнути способи входу' : 'Aanmeldmethoden inklappen'}
            title={uk ? 'Згорнути' : 'Inklappen'}
            onClick={onSluit}
          >
            <X aria-hidden='true' />
          </button>
        ) : null}
      </div>

      <div className='am3-aanmeld-keuze-inhoud'>
        {indeling.hoofd.map((m) =>
          m === 'google' ? (
            <Fragment key='google'>{maakGoogleKnop(eersteHoofdMethode === 'google')}</Fragment>
          ) : m === 'telegram' ? (
            <AanmeldTelegram key='telegram' lang={lang} remember={rememberBrowser} intent={intent} />
          ) : werkendZonderGoogle.includes(m) ? (
            <AanmeldZonderGoogle
              key={m}
              id={m as ZonderGoogleId}
              lang={lang}
              remember={rememberBrowser}
              hoofd={eersteHoofdMethode === m}
              intent={intent}
            />
          ) : null,
        )}

        <AanmeldAndereOpties
          lang={lang}
          ids={indeling.andere}
          extra={{
            ...(indeling.andere.includes('google')
              ? {
                  google: (
                    <button
                      type='button'
                      className='mr-sign-in-optie mr-sign-in-optie-google'
                      disabled={busy || undefined}
                      onClick={onGoogle}
                    >
                      <span className='mr-sign-in-optie-logo' aria-hidden='true'>
                        {googleG}
                      </span>
                      <span className='mr-sign-in-optie-tekst'>
                        <strong>{uk ? 'Увійти через Google' : 'Aanmelden met Google'}</strong>
                      </span>
                    </button>
                  ),
                }
              : {}),
            ...(indeling.andere.includes('telegram')
              ? {
                  telegram: <AanmeldTelegram lang={lang} remember={rememberBrowser} intent={intent} />,
                }
              : {}),
            ...Object.fromEntries(
              werkendZonderGoogle
                .filter((m) => indeling.andere.includes(m as never))
                .map((m) => [
                  m,
                  <AanmeldZonderGoogle
                    key={m}
                    id={m as ZonderGoogleId}
                    lang={lang}
                    remember={rememberBrowser}
                    intent={intent}
                  />,
                ]),
            ),
          }}
        />

        <label className='mr-sign-in-remember am3-aanmeld-keuze-remember'>
          <input
            type='checkbox'
            checked={rememberBrowser}
            onChange={(event) => kiesOnthouden(event.target.checked)}
          />
          <span>{uk ? 'Зберегти обліковий запис на цьому пристрої' : 'Account op dit apparaat bewaren'}</span>
        </label>
      </div>
    </section>
  );
}
