// Універсальна компактна піктограмна кнопка або посилання зі спливною назвою (HERSTEL-001).
// На комп’ютері показує матову спливну капсулу при наведенні миші або фокусі клавіатури (дія з першого натиску).
// На смартфоні виконує дію одразу з першого дотику без блокувальної затримки, а при довгому утримуванні (420 мс) відкриває спливну підказку.

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type AriaRole,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export type IcoonActieToon =
  | 'standaard'
  | 'actief'
  | 'primair-let'
  | 'primair-goed'
  | 'primair-fout';

export type IcoonActieModus = 'actie' | 'tab';

export type IcoonActieKnopProps = {
  icoon: ReactNode;
  label: string;
  srTekst?: string;
  zichtbareTekst?: string;
  zichtbareTekstKlas?: string;
  ariaLabel?: string;
  teller?: number;
  stip?: boolean;
  toon?: IcoonActieToon;
  modus?: IcoonActieModus;
  href?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  role?: AriaRole;
  stopPropagatie?: boolean;
  'aria-label'?: string;
  'aria-selected'?: boolean;
  'aria-pressed'?: boolean;
  'aria-expanded'?: boolean;
  'aria-controls'?: string;
  'data-qa-id'?: string;
  'data-mel-heropenen'?: string;
  'data-mel-ongelezen'?: string;
  onClick?: (e: ReactMouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void;
};

type TipPositie = {
  left: number;
  top: number;
  maxWidth: number;
};

const AANRAAK_LANG_DRUK = 420;
const AANRAAK_ACTIE_DUUR_MS = 2800;
const AANRAAK_TAB_DUUR_MS = 1600;
const useIsomorfLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

let actieveTipSleutel: string | null = null;
let sluitActieveTipFn: (() => void) | null = null;

function registreerActieveTip(sleutel: string, sluitFn: () => void) {
  if (actieveTipSleutel && actieveTipSleutel !== sleutel && sluitActieveTipFn) {
    sluitActieveTipFn();
  }
  actieveTipSleutel = sleutel;
  sluitActieveTipFn = sluitFn;
}

function wisActieveTipRegistratie(sleutel: string) {
  if (actieveTipSleutel === sleutel) {
    actieveTipSleutel = null;
    sluitActieveTipFn = null;
  }
}

export default function IcoonActieKnop({
  icoon,
  label,
  srTekst,
  zichtbareTekst,
  zichtbareTekstKlas,
  ariaLabel,
  teller,
  stip = false,
  toon = 'standaard',
  modus = 'actie',
  href,
  disabled = false,
  className = '',
  style,
  role,
  stopPropagatie = false,
  onClick,
  ...ariaEnData
}: IcoonActieKnopProps) {
  const uniekId = useId();
  const tipDomId = `puls-tip-${uniekId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const knopRef = useRef<HTMLButtonElement | HTMLAnchorElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const langDrukTimerRef = useRef<number | undefined>(undefined);
  const langDrukGeopendRef = useRef(false);
  const pointerSoortRef = useRef<'mouse' | 'touch' | null>(null);
  const laatsteAanrakingTsRef = useRef(0);
  const laatstePointerDownTsRef = useRef(0);

  const [tipOpen, setTipOpen] = useState(false);
  const [aanraakActief, setAanraakActief] = useState(false);
  const [positie, setPositie] = useState<TipPositie>({ left: 8, top: 8, maxWidth: 280 });

  const wisLangDrukTimer = useCallback(() => {
    if (langDrukTimerRef.current !== undefined && typeof window !== 'undefined') {
      window.clearTimeout(langDrukTimerRef.current);
      langDrukTimerRef.current = undefined;
    }
  }, []);

  const wisTimer = useCallback(() => {
    if (timerRef.current !== undefined && typeof window !== 'undefined') {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const sluitTipVolledig = useCallback(() => {
    wisLangDrukTimer();
    wisTimer();
    setTipOpen(false);
    setAanraakActief(false);
    wisActieveTipRegistratie(uniekId);
  }, [uniekId, wisLangDrukTimer, wisTimer]);

  useEffect(() => () => sluitTipVolledig(), [sluitTipVolledig]);

  const werkPositieBij = useCallback(() => {
    if (typeof window === 'undefined' || !knopRef.current) return;
    const vw = window.innerWidth || 360;
    const vh = window.innerHeight || 800;
    const kaderEl = knopRef.current.closest('.mel-ecosysteem-portaal, .mel-ecosysteem-paneel, .menu-bellen');
    const kader = kaderEl ? kaderEl.getBoundingClientRect() : null;
    const minLinks = kader && kader.width > 160 ? Math.max(8, Math.round(kader.left + 8)) : 8;
    const maxRechts = kader && kader.width > 160 ? Math.min(vw - 8, Math.round(kader.right - 8)) : vw - 8;
    const maxWidth = Math.max(120, Math.min(288, maxRechts - minLinks));
    const r = knopRef.current.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;

    const geschatteB = Math.min(maxWidth, Math.max(72, Math.round(label.length * 7.2 + 22)));
    const tipB = Math.min(maxWidth, tipRef.current?.offsetWidth || geschatteB);
    const tipH = tipRef.current?.offsetHeight || 28;

    const gecentreerdLinks = Math.round(r.left + r.width / 2 - tipB / 2);
    const left = Math.max(minLinks, Math.min(maxRechts - tipB, gecentreerdLinks));

    const bovenTop = Math.round(r.top - tipH - 7);
    const onderTop = Math.round(r.bottom + 7);
    const top = bovenTop >= 8 ? bovenTop : Math.max(8, Math.min(vh - tipH - 8, onderTop));

    setPositie((oud) =>
      oud.left === left && oud.top === top && oud.maxWidth === maxWidth ? oud : { left, top, maxWidth },
    );
  }, [label]);

  const openTip = useCallback(
    (duurMs?: number, alsAanraak = false) => {
      wisTimer();
      setAanraakActief(alsAanraak);
      registreerActieveTip(uniekId, sluitTipVolledig);
      setTipOpen(true);
      werkPositieBij();
      if (duurMs && typeof window !== 'undefined') {
        timerRef.current = window.setTimeout(() => {
          sluitTipVolledig();
        }, duurMs);
      }
    },
    [sluitTipVolledig, uniekId, werkPositieBij, wisTimer],
  );

  useIsomorfLayoutEffect(() => {
    if (!tipOpen) return undefined;
    werkPositieBij();
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(werkPositieBij) : 0;
    const bijScrollOfMaat = () => {
      if (!knopRef.current) {
        sluitTipVolledig();
        return;
      }
      const r = knopRef.current.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      if (r.bottom < 0 || r.top > vh) {
        sluitTipVolledig();
        return;
      }
      werkPositieBij();
    };
    const bijBuitenPointerDown = (e: PointerEvent) => {
      const doel = e.target as Node | null;
      if (doel && knopRef.current && !knopRef.current.contains(doel)) {
        sluitTipVolledig();
      }
    };
    window.addEventListener('scroll', bijScrollOfMaat, true);
    window.addEventListener('resize', bijScrollOfMaat, { passive: true });
    document.addEventListener('pointerdown', bijBuitenPointerDown, true);
    return () => {
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      window.removeEventListener('scroll', bijScrollOfMaat, true);
      window.removeEventListener('resize', bijScrollOfMaat);
      document.removeEventListener('pointerdown', bijBuitenPointerDown, true);
    };
  }, [tipOpen, label, werkPositieBij, sluitTipVolledig]);

  const startLangDruk = useCallback(() => {
    wisLangDrukTimer();
    langDrukGeopendRef.current = false;
    if (typeof window === 'undefined') return;
    langDrukTimerRef.current = window.setTimeout(() => {
      langDrukTimerRef.current = undefined;
      langDrukGeopendRef.current = true;
      openTip(AANRAAK_ACTIE_DUUR_MS, true);
    }, AANRAAK_LANG_DRUK);
  }, [openTip, wisLangDrukTimer]);

  const opPointerDown = (e: ReactPointerEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    if (disabled) return;
    laatstePointerDownTsRef.current = Date.now();
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      pointerSoortRef.current = 'touch';
      laatsteAanrakingTsRef.current = Date.now();
      startLangDruk();
    } else {
      pointerSoortRef.current = 'mouse';
      wisLangDrukTimer();
      langDrukGeopendRef.current = false;
    }
  };

  const opPointerUp = () => {
    wisLangDrukTimer();
  };

  const opTouchStart = () => {
    if (disabled) return;
    laatstePointerDownTsRef.current = Date.now();
    pointerSoortRef.current = 'touch';
    laatsteAanrakingTsRef.current = Date.now();
    if (langDrukTimerRef.current === undefined) {
      startLangDruk();
    }
  };

  const opTouchEnd = () => {
    wisLangDrukTimer();
  };

  const opPointerEnter = (e: ReactPointerEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    if (disabled || e.pointerType !== 'mouse') return;
    openTip(undefined, false);
  };

  const opPointerLeave = (e: ReactPointerEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    wisLangDrukTimer();
    if (e.pointerType !== 'mouse' || aanraakActief) return;
    sluitTipVolledig();
  };

  const opFocus = (_e: ReactFocusEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    if (disabled) return;
    if (Date.now() - laatstePointerDownTsRef.current > 250) {
      openTip(undefined, false);
    }
  };

  const opBlur = () => {
    if (aanraakActief) return;
    sluitTipVolledig();
  };

  const opKlik = (e: ReactMouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    wisLangDrukTimer();
    if (disabled) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (langDrukGeopendRef.current) {
      langDrukGeopendRef.current = false;
      e.preventDefault();
      if (stopPropagatie) e.stopPropagation();
      return;
    }

    const nu = Date.now();
    const isAanraking = pointerSoortRef.current === 'touch' && nu - laatsteAanrakingTsRef.current < 1500;
    pointerSoortRef.current = null;

    if (isAanraking && modus === 'tab' && !zichtbareTekst) {
      if (stopPropagatie) e.stopPropagation();
      onClick?.(e);
      openTip(AANRAAK_TAB_DUUR_MS, false);
      return;
    }

    sluitTipVolledig();
    if (stopPropagatie) e.stopPropagation();
    onClick?.(e);
  };

  const toonTeller = typeof teller === 'number' && Number.isFinite(teller) && teller > 0;
  const samengesteldeKlassen = [
    'mel-ikoon-knop',
    'puls-icoon-knop',
    `is-toon-${toon}`,
    toon === 'actief' ? 'is-actief' : '',
    aanraakActief ? 'is-tip-open' : '',
    toonTeller ? 'heeft-teller' : '',
    zichtbareTekst ? 'heeft-zichtbare-tekst' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const inhoud = (
    <>
      <span className='puls-icoon-symbool' aria-hidden='true'>
        {icoon}
      </span>
      {zichtbareTekst ? (
        <span className={zichtbareTekstKlas || 'puls-icoon-tekst'} aria-hidden='true'>
          {zichtbareTekst}
        </span>
      ) : null}
      {toonTeller ? (
        <b className='puls-icoon-teller' aria-hidden='true'>
          {teller > 999 ? '999+' : teller}
        </b>
      ) : null}
      {stip ? <i className='puls-filter-stip' aria-hidden='true' /> : null}
      <span className='mr-sr'>{srTekst ?? label}</span>
    </>
  );

  const gedeeldeAttributen = {
    className: samengesteldeKlassen,
    style,
    role,
    'aria-label': ariaLabel ?? label,
    'aria-describedby': tipOpen ? tipDomId : undefined,
    'data-puls-icoon-knop': modus,
    'data-tip-open': tipOpen ? '1' : undefined,
    onPointerDown: opPointerDown,
    onPointerUp: opPointerUp,
    onPointerCancel: opPointerUp,
    onTouchStart: opTouchStart,
    onTouchEnd: opTouchEnd,
    onTouchCancel: opTouchEnd,
    onPointerEnter: opPointerEnter,
    onPointerLeave: opPointerLeave,
    onFocus: opFocus,
    onBlur: opBlur,
    onClick: opKlik,
    ...ariaEnData,
  };

  const portaalWortel =
    tipOpen && typeof document !== 'undefined' && document.body
      ? knopRef.current?.closest<HTMLElement>('.mel-ecosysteem-portaal, .mel-ecosysteem-paneel, .menu-bellen') ||
        document.querySelector<HTMLElement>('.canonical-chrome') ||
        document.body
      : null;

  const portaalTip = portaalWortel
    ? createPortal(
        <div
          ref={tipRef}
          id={tipDomId}
          role='tooltip'
          data-qa-id='puls-icoon-tip'
          className='puls-icoon-tip'
          style={{
            position: 'fixed',
            left: `${positie.left}px`,
            top: `${positie.top}px`,
            maxWidth: `${positie.maxWidth}px`,
            zIndex: 2147483610,
            pointerEvents: 'none',
          }}
        >
          {label}
        </div>,
        portaalWortel,
      )
    : null;

  if (href && !disabled) {
    return (
      <>
        <a
          ref={(el) => {
            knopRef.current = el;
          }}
          href={href}
          {...gedeeldeAttributen}
        >
          {inhoud}
        </a>
        {portaalTip}
      </>
    );
  }

  return (
    <>
      <button
        ref={(el) => {
          knopRef.current = el;
        }}
        type='button'
        disabled={disabled}
        {...gedeeldeAttributen}
      >
        {inhoud}
      </button>
      {portaalTip}
    </>
  );
}
