import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cachedAvatarUrl, normalizeAvatarUrl, rememberAvatarUrl } from './gedeelde-voorkeuren';

type Props = { src?: string; fallback: ReactNode; persist?: boolean; usePresentationCache?: boolean; alt?: string };

export default function StableAvatar({ src = '', fallback, persist = false, usePresentationCache = false, alt = '' }: Props) {
  const initial = normalizeAvatarUrl(src) || (usePresentationCache ? cachedAvatarUrl() : '');
  const [display, setDisplay] = useState(initial);
  const current = useRef(initial);

  useEffect(() => {
    const next = normalizeAvatarUrl(src) || (usePresentationCache ? cachedAvatarUrl() : '');
    if (!next) {
      if (current.current) {
        current.current = '';
        setDisplay('');
      }
      return;
    }
    if (next === current.current) {
      if (persist) rememberAvatarUrl(next);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    const commit = () => {
      if (cancelled || next === current.current) return;
      current.current = next;
      setDisplay(next);
      if (persist) rememberAvatarUrl(next);
    };
    const reset = () => {
      if (cancelled) return;
      current.current = '';
      setDisplay('');
    };
    image.onload = commit;
    image.onerror = reset;
    image.src = next;
    if (image.complete && image.naturalWidth > 0) void image.decode().then(commit).catch(commit);
    return () => {
      cancelled = true;
    };
  }, [src, persist, usePresentationCache]);

  return display ? (
    <img
      className='avatar-img'
      src={display}
      alt={alt}
      decoding='async'
      referrerPolicy='no-referrer'
      onError={() => {
        current.current = '';
        setDisplay('');
      }}
    />
  ) : (
    <>{fallback}</>
  );
}

export function PresentationAvatar() {
  return (
    <div className='account-avatar-placeholder presentation-avatar' aria-hidden='true'>
      <StableAvatar usePresentationCache fallback={<span className='canonical-glyph glyph-user' />} />
    </div>
  );
}
