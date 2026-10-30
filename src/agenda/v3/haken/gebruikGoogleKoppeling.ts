// Google koppelen ZONDER de agenda te verlaten: de toestemming opent in een apart venster (window.open vóór de eerste await,
// anders blokkeert de browser het), en deze haak peilt het overzicht tot de server «lezen» (of «schrijven») bevestigt — dan
// sluit het venster en ververst de pagina zichzelf. Tot 29.10.2026 deed de knop location.assign(cloud) en verloor de mens de
// agenda; nu blijft hij waar hij is.
//
// Eerlijkheid: Google-toestemmingen gaan op deze site in een vaste volgorde (mail → drive → calendar, zie
// backend/google-suite-inrichting.ts PLAN). Wie nog geen mail/drive gaf, krijgt van de server GOOGLE_SUITE_SEQUENCE_REQUIRED;
// dan toont de knop dat eerlijk («спершу пошта і диск») met een link naar de Google-pagina in een NIEUW tabblad — en blijft
// peilen, zodat de agenda vanzelf omslaat zodra de reeks daar is afgerond. De canonieke volgorde zelf blijft onaangeroerd.
import { useEffect, useRef, useState } from 'react';
import * as client from '../../agenda-client';

export type GoogleKoppelStand = 'rust' | 'wacht' | 'reeks' | 'fout';
const PEIL_MS = 2500;
const PEIL_MAX_MS = 10 * 60_000;

export function gebruikGoogleKoppeling(opties: { onKlaar: () => void }) {
  const [stand, setStand] = useState<GoogleKoppelStand>('rust');
  const [foutCode, setFoutCode] = useState('');
  const timer = useRef<number | null>(null);
  const venster = useRef<Window | null>(null);
  const stop = () => { if (timer.current) { window.clearInterval(timer.current); timer.current = null; } };
  useEffect(() => () => { stop(); if (venster.current && !venster.current.closed) venster.current.close(); }, []);

  const peil = (doel: 'lezen' | 'schrijven') => {
    stop();
    const einde = Date.now() + PEIL_MAX_MS;
    timer.current = window.setInterval(async () => {
      if (Date.now() > einde) { stop(); setStand('rust'); return; }
      try {
        const d = await client.laadOverzicht();
        const klaar = doel === 'schrijven' ? Boolean(d.toegang?.schrijven) : Boolean(d.toegang?.lezen);
        if (klaar) { stop(); if (venster.current && !venster.current.closed) venster.current.close(); venster.current = null; setStand('rust'); setFoutCode(''); opties.onKlaar(); }
      } catch { /* even geen verbinding: volgende peiling */ }
    }, PEIL_MS);
  };

  /** Start het koppelen (of de uitbreiding naar schrijven). MOET rechtstreeks uit een klik komen (popup-regel van de browser). */
  const start = (doel: 'lezen' | 'schrijven' = 'lezen') => {
    setFoutCode('');
    // Eerst het venster (synchron), dán pas netwerk: anders ziet de browser het niet meer als een gebruikersklik.
    const popup = window.open('about:blank', 'agenda-google-koppeling', 'popup=yes,width=520,height=720');
    venster.current = popup;
    setStand('wacht');
    void (async () => {
      try {
        const u = await client.startUitbreiding();
        if (u.alGegeven) { if (popup && !popup.closed) popup.close(); venster.current = null; setStand('rust'); opties.onKlaar(); return; }
        if (!u.authUrl) throw new Error('GEEN_AUTH_URL');
        if (popup && !popup.closed) popup.location.replace(u.authUrl);
        else { location.assign(u.authUrl); return; } // popup geblokkeerd: de oude, hele-pagina-weg als terugval
        peil(doel);
      } catch (e) {
        if (popup && !popup.closed) popup.close();
        venster.current = null;
        const code = String((e as Error)?.message || 'FOUT');
        if (code === 'GOOGLE_SUITE_SEQUENCE_REQUIRED') { setStand('reeks'); peil(doel); }
        else { setFoutCode(code); setStand('fout'); }
      }
    })();
  };

  return { stand, foutCode, start, stop: () => { stop(); setStand('rust'); } };
}
