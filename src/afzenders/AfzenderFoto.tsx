// Foto of logo van één afzender (contactkaart, venster): het beeld van de EIGEN server (src/afzenders/afzender-beelden.ts →
// backend/merk-bron.ts) — een foto uit de eigen Google-contacten/vCard/Gravatar, anders het logo van het domein van een
// organisatie, anders de beginletters. Vaste maat, dus geen sprong als het beeld binnenkomt. Decoratief: de naam staat ernaast.
import { useEffect, useState } from 'react';
import { api } from '../platform/client';
import StableAvatar from '../StabielAvatar';
import { useAfzenderBeeld, type AfzenderBeeld } from './afzender-beelden';
import './afzenders.css';

const letters = (naam: string, adres: string) => (String(naam || adres || '?').replace(/<[^>]*>/g, '').trim().split(/[\s.@_-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?');
const snelCache = new Map<string, AfzenderBeeld | null>();
const snelBezig = new Map<string, Promise<AfzenderBeeld | null>>();

function haalSnelBeeld(adres: string): Promise<AfzenderBeeld | null> {
  const k = String(adres || '').trim().toLowerCase();
  if (!k || !k.includes('@')) return Promise.resolve(null);
  if (snelCache.has(k)) return Promise.resolve(snelCache.get(k) ?? null);
  const lopend = snelBezig.get(k);
  if (lopend) return lopend;
  const p = api
    .post<{ beelden?: AfzenderBeeld[] }>('/api/owner/mail/afzender-beelden', { adressen: [k] })
    .then((r) => {
      const gevonden = (r?.beelden || []).find((x) => String(x.adres || '').toLowerCase() === k) ?? null;
      snelCache.set(k, gevonden);
      return gevonden;
    })
    .catch(() => null)
    .finally(() => { snelBezig.delete(k); });
  snelBezig.set(k, p);
  return p;
}

export default function AfzenderFoto({ adres, naam = '', maat = 40 }: { adres: string; naam?: string; maat?: number }) {
  const k = String(adres || '').trim().toLowerCase();
  const gedeeld = useAfzenderBeeld(adres);
  const [snel, setSnel] = useState<AfzenderBeeld | null | undefined>(() => (snelCache.has(k) ? snelCache.get(k) : undefined));
  useEffect(() => {
    if (!k || gedeeld !== undefined || snelCache.has(k)) {
      if (snelCache.has(k)) setSnel(snelCache.get(k));
      return;
    }
    let actief = true;
    void haalSnelBeeld(k).then((res) => { if (actief && res !== null) setSnel(res); });
    return () => { actief = false; };
  }, [k, gedeeld]);
  const b = gedeeld !== undefined ? gedeeld : snel;
  const directData = Boolean(b?.data && b.data.startsWith('data:image/'));
  return (
    <span className='afz-foto' aria-hidden='true' data-afzender-foto={b ? b.soort : 'geen'} data-afzender-bron={b?.bron || undefined}
      style={{ width: maat, height: maat, fontSize: Math.round(maat * 0.38) }}>
      {directData
        ? <img className='avatar-img' src={b!.data} alt='' decoding='async' referrerPolicy='no-referrer' />
        : <StableAvatar src={b?.data || ''} fallback={<span className='afz-foto-letters'>{letters(naam, adres)}</span>} alt='' />}
    </span>
  );
}

