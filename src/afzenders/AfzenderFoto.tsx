// Foto of logo van één afzender (contactkaart, venster): het beeld van de EIGEN server (src/afzenders/afzender-beelden.ts →
// backend/merk-bron.ts) — een foto uit de eigen Google-contacten/vCard/Gravatar, anders het logo van het domein van een
// organisatie, anders de beginletters. Vaste maat, dus geen sprong als het beeld binnenkomt. Decoratief: de naam staat ernaast.
import StableAvatar from '../StabielAvatar';
import { useAfzenderBeeld } from './afzender-beelden';
import './afzenders.css';

const letters = (naam: string, adres: string) => (String(naam || adres || '?').replace(/<[^>]*>/g, '').trim().split(/[\s.@_-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?');

export default function AfzenderFoto({ adres, naam = '', maat = 40 }: { adres: string; naam?: string; maat?: number }) {
  const b = useAfzenderBeeld(adres);
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
