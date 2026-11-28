// Pastille naast de afzendernaam (lijst in alle dichtheden + kop van een geopend bericht).
//  перевірений   — neutraal-groene vink, tooltip «Перевірений відправник: <адреса>, як перевірено».
//  неперевірений — naam + adres zichtbaar + oranje pastille; bij hover/focus uitleg + «Перевірити вручну і зберегти в контакти».
//  підозрілий    — rode pastille «Можливе видавання себе за інший сервіс» + dezelfde knop (met extra waarschuwing).
// Nooit alleen kleur: elk icoon heeft een tekst voor schermlezers. Klikken/toetsen in de pastille openen het bericht niet.
import { BadgeCheck, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { isGratisMailbox, redenTekst } from '../../shared/mail-afzenders';
import { openContacten, useAfzender, useMarkeringenAan, type AfzenderInfo } from './api';
import './afzenders.css';

const AfzenderDialoog = lazy(() => import('./AfzenderDialoog'));
type Lang = 'uk' | 'nl';
export type BerichtAuthKort = { spf?: string; dkim?: string; dmarc?: string; trusted?: boolean; signedBy?: string };
const t = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
const ICOON = { width: 14, height: 14 } as const;
const stop = (e: SyntheticEvent) => { e.stopPropagation(); };

export function bronTekst(lang: Lang, a: Pick<AfzenderInfo, 'bron' | 'merk'>) {
  if (a.bron === 'handmatig') return t(lang, 'підтверджено вами вручну', 'door u zelf bevestigd');
  if (a.bron === 'bekende-dienst') return t(lang, `офіційна адреса ${a.merk || 'відомого сервісу'}, Gmail підтвердив доставку (DMARC)`, `officieel adres van ${a.merk || 'een bekende dienst'}, door Gmail bevestigd (DMARC)`);
  return t(lang, 'перевірено', 'bevestigd');
}

export default function AfzenderBadge({
  lang,
  from,
  messageId = '',
  accountId = '',
  toonAdres = false,
  plek = 'rij',
  berichtAuth,
}: {
  lang: Lang;
  from: string;
  messageId?: string;
  accountId?: string;
  toonAdres?: boolean;
  plek?: 'rij' | 'lezer';
  berichtAuth?: BerichtAuthKort | null;
}) {
  const a = useAfzender(from, messageId, accountId), markeringen = useMarkeringenAan();
  const [open, setOpen] = useState(false), [dialoog, setDialoog] = useState(false);
  const knop = useRef<HTMLButtonElement | null>(null), sluitTimer = useRef(0);
  const [pos, setPos] = useState<{ x: number; y: number; boven: boolean } | null>(null);
  const tipId = useId();
  const plaats = useCallback(() => {
    const r = knop.current?.getBoundingClientRect(); if (!r) return;
    const boven = r.bottom + 200 > window.innerHeight && r.top > 220;
    setPos({ x: Math.max(8, Math.min(window.innerWidth - 316, r.left - 12)), y: boven ? r.top - 8 : r.bottom + 8, boven });
  }, []);
  const toon = () => { window.clearTimeout(sluitTimer.current); plaats(); setOpen(true); };
  const verberg = () => { window.clearTimeout(sluitTimer.current); sluitTimer.current = window.setTimeout(() => setOpen(false), 160); };
  useEffect(() => () => window.clearTimeout(sluitTimer.current), []);
  useEffect(() => {
    if (!open) return;
    const weg = () => setOpen(false);
    window.addEventListener('scroll', weg, true); window.addEventListener('resize', weg);
    return () => { window.removeEventListener('scroll', weg, true); window.removeEventListener('resize', weg); };
  }, [open]);
  if (!a || !a.adres) return null;
  const spfStand = a.spf || berichtAuth?.spf || '';
  const dkimStand = a.dkim || berichtAuth?.dkim || '';
  const dmarcStand = a.dmarc || berichtAuth?.dmarc || '';
  const domeinBevestigd =
    a.status === 'onbekend' &&
    !isGratisMailbox(a.domein) &&
    (a.reden === 'DOMEIN_AUTH_GESLAAGD' ||
      a.domeinAuth === 'pass' ||
      dmarcStand === 'pass' ||
      (spfStand === 'pass' && dkimStand === 'pass'));
  // Vóór de eerste volledige controle: geen oranje pastille in de lijst; een cryptografisch bevestigd domein tonen we wel meteen, en een officiële bekende dienst die nog op kopregels wacht krijgt in de rij geen vals oranje vraagteken.
  if (a.status === 'onbekend' && a.reden === 'BEKENDE_DIENST_ZONDER_AUTH' && plek === 'rij' && !domeinBevestigd) return null;
  if (a.status === 'onbekend' && !markeringen && !domeinBevestigd) return null;
  const adresTekst = toonAdres && a.status !== 'geverifieerd' ? <span className='afz-adres' title={a.adres}>{a.adres}</span> : null;
  const toets = (e: KeyboardEvent) => { e.stopPropagation(); if (e.key === 'Escape') setOpen(false); };
  const druk = (e: RPointerEvent) => { e.stopPropagation(); };

  if (a.status === 'geverifieerd') {
    const tip = t(lang, `Перевірений відправник: ${a.adres}, ${bronTekst(lang, a)}`, `Geverifieerde afzender: ${a.adres}, ${bronTekst(lang, a)}`);
    return <span className='afz-groep'><span className={`afz-badge afz-ok afz-${plek}`} title={tip} data-afzender-status='geverifieerd'>
      <BadgeCheck aria-hidden='true' style={ICOON} /><span className='afz-sr'>{tip}</span>
    </span></span>;
  }

  const verdacht = a.status === 'verdacht';
  const kort = verdacht
    ? (a.bericht === 'auth-mislukt' ? t(lang, 'Цей лист не пройшов перевірку Gmail', 'Dit bericht doorstond de controle van Gmail niet') : t(lang, 'Можливе видавання себе за інший сервіс', 'Mogelijke imitatie van een andere dienst'))
    : domeinBevestigd
      ? t(lang, 'Домен відправника підтверджено', 'Domein van afzender bevestigd')
      : t(lang, 'Не підтверджено', 'Niet bevestigd');
  const uitlegCode = domeinBevestigd ? 'DOMEIN_AUTH_GESLAAGD' : a.reden;
  const badgeKlas = verdacht ? 'afz-verdacht' : domeinBevestigd ? 'afz-domein-ok' : 'afz-onbekend';
  const statusAttr = domeinBevestigd ? 'domein-bevestigd' : a.status;

  return <span className='afz-groep'>
    {adresTekst}
    <button ref={knop} type='button' className={`afz-badge ${badgeKlas} afz-${plek}`} data-afzender-status={statusAttr}
      data-afzender-domein-auth={domeinBevestigd ? 'pass' : a.domeinAuth || undefined}
      aria-label={`${kort}: ${a.adres}`} aria-describedby={open ? tipId : undefined} aria-expanded={open}
      onPointerEnter={toon} onPointerLeave={verberg} onFocus={toon} onBlur={verberg} onPointerDown={druk} onMouseDown={stop}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (open) setOpen(false); else toon(); }} onKeyDown={toets}>
      {verdacht ? <ShieldAlert aria-hidden='true' style={ICOON} /> : domeinBevestigd ? <ShieldCheck aria-hidden='true' style={ICOON} /> : <ShieldQuestion aria-hidden='true' style={ICOON} />}
      {verdacht && plek === 'lezer' && <span className='afz-badge-tekst'>{t(lang, 'Підозріло', 'Verdacht')}</span>}
    </button>
    {open && pos && createPortal(<div id={tipId} role='tooltip' className={`afz-tip${verdacht ? ' afz-tip-verdacht' : domeinBevestigd ? ' afz-tip-domein-ok' : ''}`} style={{ left: pos.x, top: pos.y, transform: pos.boven ? 'translateY(-100%)' : undefined }}
      onPointerEnter={toon} onPointerLeave={verberg} onClick={stop} onPointerDown={druk} onKeyDown={toets}>
      <strong>{kort}</strong>
      <span className='afz-tip-adres'>{a.naam ? `${a.naam} · ` : ''}{a.adres}</span>
      {domeinBevestigd && (
        <div className='afz-tip-bewijzen' aria-label={t(lang, 'Криптографічні перевірки домену', 'Cryptografische domeincontroles')}>
          {(spfStand === 'pass' || !spfStand) && <span className='afz-bewijs-pil'>✓ SPF</span>}
          {(dkimStand === 'pass' || !dkimStand) && <span className='afz-bewijs-pil'>✓ DKIM{a.domein ? ` · ${a.domein}` : ''}</span>}
          <span className='afz-bewijs-pil'>✓ DMARC</span>
        </div>
      )}
      <p>{redenTekst(uitlegCode, lang)}</p>
      <button type='button' className='afz-tip-knop' onFocus={toon} onBlur={verberg} onClick={(e) => { e.stopPropagation(); setOpen(false); setDialoog(true); }}>
        {verdacht ? t(lang, 'Я знаю відправника — перевірити вручну', 'Ik ken de afzender — zelf controleren') : domeinBevestigd ? t(lang, 'Зберегти в контакти', 'Bewaren in contacten') : t(lang, 'Перевірити вручну і зберегти в контакти', 'Zelf controleren en bewaren in contacten')}
      </button>
      <button type='button' className='afz-alle-contacten' onFocus={toon} onBlur={verberg} onClick={(e) => { e.stopPropagation(); setOpen(false); void openContacten(a.adres, lang); }}>
        {t(lang, 'Усі контакти й докази перевірки', 'Alle contacten en het bewijs')}
      </button>
    </div>, document.body)}
    {dialoog && <Suspense fallback={null}><AfzenderDialoog lang={lang} from={from} info={a} messageId={messageId} accountId={accountId} onSluit={() => { setDialoog(false); knop.current?.focus(); }} /></Suspense>}
  </span>;
}
