// Gegevens van de agenda via de bestaande client (src/agenda/agenda-client.ts; dezelfde eindpunten als de oude pagina).
// Bij een fout blijven de laatst geladen afspraken staan (nooit een lege agenda door een fout), met het tijdstip van de laatste
// geslaagde verversing en «Повторити».
import { useCallback, useEffect, useRef, useState } from 'react';
import * as client from '../../agenda-client';

export type AgendaGegevens = {
  data: client.AgendaOverzicht | null; laden: boolean; fout: string; laatstGelukt: number | null;
  synchroniseren: boolean; syncFout: string;
  verversen: () => Promise<void>; synchroniseer: () => Promise<void>;
};

export function gebruikAgendaGegevens(eigenaar: string): AgendaGegevens {
  const [data, setData] = useState<client.AgendaOverzicht | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState('');
  const [laatstGelukt, setLaatstGelukt] = useState<number | null>(null);
  const [synchroniseren, setSync] = useState(false);
  const [syncFout, setSyncFout] = useState('');
  const levend = useRef(true);
  useEffect(() => { levend.current = true; return () => { levend.current = false; }; }, []);
  const verversen = useCallback(async () => {
    setLaden(true);
    try { const v = await client.laadOverzicht(); if (!levend.current) return; setData(v); setFout(''); setLaatstGelukt(Date.now()); }
    catch (e) { if (levend.current) setFout(String((e as Error)?.message || 'FOUT')); }
    finally { if (levend.current) setLaden(false); }
  }, []);
  const synchroniseer = useCallback(async () => {
    setSync(true); setSyncFout('');
    try { await client.synchroniseer(true); }
    catch (e) { setSyncFout(String((e as Error)?.message || 'SYNC_MISLUKT')); }
    finally { setSync(false); await verversen(); }
  }, [verversen]);
  useEffect(() => { void verversen(); }, [eigenaar, verversen]);
  return { data, laden, fout, laatstGelukt, synchroniseren, syncFout, verversen, synchroniseer };
}
