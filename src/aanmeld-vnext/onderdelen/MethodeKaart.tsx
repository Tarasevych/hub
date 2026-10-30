// UI-015 — één methodekaart (dossier §5): herkenbaar icoon, titel + één regel uitleg, de staat ALS TEKST (kleur is alleen
// een stip, nooit de enige drager), een eerlijke teller alleen als de API die gaf, en ÉÉN hoofdactie. De hele kaart opent
// de details; «verwijderen» bestaat niet op een beschermde laatste aanmeldweg — de reden staat erbij, niet in een tooltip.
import { ChevronRight, Fingerprint, KeyRound, LifeBuoy, Lock, Smartphone, Users } from 'lucide-react';
import { ACTIE_LABEL, STAAT_LABEL, aanmeldTekst, type MethodeUi } from '../../../shared/aanmeld-vnext-model';
import type { Lang } from '../../toegangslaag-teksten';

const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);

export function MethodeIcoon({ icoon }: { icoon: string }) {
  // Google: eigen merk-monogram (zelfde aanpak als MenuGlyph: een letter, geen getekend vreemd logo).
  if (icoon === 'google') return <span className='amv-brand' aria-hidden='true'>G</span>;
  const I = icoon === 'password' ? KeyRound : icoon === 'passkey' ? Fingerprint : icoon === 'totp' ? Smartphone : icoon === 'recovery' ? LifeBuoy : icoon === 'vault' ? Lock : Users;
  return <I aria-hidden='true' />;
}

type Props = { lang: Lang; kaart: MethodeUi; anker?: string; onOpen: (k: MethodeUi) => void; onRetry: () => void };
export default function MethodeKaart({ lang, kaart: k, anker, onOpen, onRetry }: Props) {
  const actie = k.hoofdActie;
  const actieKnop = actie !== 'none' ? (
    <button type='button' className={`amv-knop${actie === 'setup' ? ' is-hoofd' : ''} is-klein`} data-amv-actie={k.id}
      disabled={k.staat === 'loading'}
      onClick={(e) => { e.stopPropagation(); if (actie === 'retry') onRetry(); else onOpen(k); }}>
      {aanmeldTekst(ACTIE_LABEL[actie], lang)}
    </button>
  ) : null;
  return (
    <article className={`amv-kaart is-${k.staat}`} {...(anker ? { id: anker } : {})} data-amv-kaart={k.id} data-amv-staat={k.staat}
      role='listitem' tabIndex={0} aria-label={`${aanmeldTekst(k.titel, lang)} — ${aanmeldTekst(STAAT_LABEL[k.staat], lang)}`}
      onClick={() => onOpen(k)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(k); } }}>
      <span className='amv-kaart-icoon'><MethodeIcoon icoon={k.icoon} /></span>
      <div className='amv-kaart-tekst'>
        <strong>{aanmeldTekst(k.titel, lang)}</strong>
        <small>{k.accountLabel || aanmeldTekst(k.ondertitel, lang)}</small>
        <span className='amv-kaart-voet'>
          <span className={`amv-staat is-${k.staat}`}><i aria-hidden='true' />{aanmeldTekst(STAAT_LABEL[k.staat], lang)}</span>
          {typeof k.teller === 'number' ? <span className='amv-teller'>{k.teller}</span> : null}
        </span>
        {k.staatReden ? <small className='amv-reden' {...(k.beschermd ? { 'data-amv-beschermd': k.id } : {})}>{aanmeldTekst(k.staatReden, lang)}</small> : null}
      </div>
      <span className='amv-kaart-acties'>
        {actieKnop}
        <button type='button' className='amv-icoonknop' aria-label={tr(lang, `Деталі: ${aanmeldTekst(k.titel, lang)}`, `Details: ${aanmeldTekst(k.titel, lang)}`)}
          data-amv-detail-open={k.id} onClick={(e) => { e.stopPropagation(); onOpen(k); }}>
          <ChevronRight aria-hidden='true' />
        </button>
      </span>
    </article>
  );
}
