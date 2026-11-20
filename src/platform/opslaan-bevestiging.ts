// Засіб стану для захисту від подвійного натискання та миттєвого підтвердження збереження (UPD-013):
// блокує повторний виклик під час виконання, тримає стан «Збережено ✓» / «Opgeslagen ✓» протягом 2,5 с і очищає таймер при розмонтуванні.
// Hook tegen dubbel klikken en met directe bevestiging «Opgeslagen ✓» gedurende 2,5 s.
import { useCallback, useEffect, useRef, useState } from 'react';

export type OpslaanUitkomst<T> =
  | { ok: true; waarde: T }
  | { ok: false; fout: string }
  | null;

export function opgeslagenLabel(lang: 'uk' | 'nl'): string {
  return lang === 'uk' ? 'Збережено ✓' : 'Opgeslagen ✓';
}

export function useOpslaanBevestiging(bevestigDuurMs = 2500) {
  const [bezig, setBezig] = useState(false);
  const [opgeslagen, setOpgeslagen] = useState(false);
  const [fout, setFout] = useState('');
  const actiefRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const gemountRef = useRef(true);

  useEffect(() => {
    gemountRef.current = true;
    return () => {
      gemountRef.current = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const reset = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!gemountRef.current) return;
    setOpgeslagen(false);
    setFout('');
  }, []);

  const voerUit = useCallback(async <T,>(
    fn: () => Promise<T>,
    foutOmzetter?: (err: unknown) => string,
  ): Promise<OpslaanUitkomst<T>> => {
    if (actiefRef.current) return null;
    actiefRef.current = true;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (gemountRef.current) {
      setBezig(true);
      setOpgeslagen(false);
      setFout('');
    }
    try {
      const waarde = await fn();
      if (gemountRef.current) {
        setOpgeslagen(true);
        timerRef.current = window.setTimeout(() => {
          if (gemountRef.current) setOpgeslagen(false);
          timerRef.current = null;
        }, bevestigDuurMs);
      }
      return { ok: true, waarde };
    } catch (err) {
      const tekst = foutOmzetter
        ? foutOmzetter(err)
        : (err instanceof Error && err.message ? err.message : 'FOUT');
      if (gemountRef.current) {
        setFout(tekst);
        setOpgeslagen(false);
      }
      return { ok: false, fout: tekst };
    } finally {
      actiefRef.current = false;
      if (gemountRef.current) setBezig(false);
    }
  }, [bevestigDuurMs]);

  return { bezig, opgeslagen, fout, reset, voerUit };
}
