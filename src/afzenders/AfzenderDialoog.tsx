// Venster «Перевірити вручну і зберегти в контакти»: adres, domein, SPF/DKIM/DMARC van dit bericht (alleen van de vertrouwde
// server; anders «немає даних»), naam, notitie en een uitdrukkelijke bevestiging. Bij «verdacht» een tweede bevestiging.
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { redenTekst } from '../../shared/mail-afzenders';
import { NU_UITLEG } from '../../shared/afzender-regels';
import { afzenderApi, afzenderGewijzigd, foutCode, openContacten, type AfzenderInfo, type AuthUit } from './api';
import './afzenders.css';

type Lang = 'uk' | 'nl';
const t = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
const FOUTEN: Record<string, [string, string]> = {
  AFZENDER_VERDACHT_BEVESTIG: ['Цей відправник виглядає підозріло. Підтвердіть, що ви розумієте ризик.', 'Deze afzender lijkt verdacht. Bevestig dat u het risico begrijpt.'],
  AFZENDER_ADRES_ONGELDIG: ['Адреса недійсна.', 'Het adres is ongeldig.'],
  AFZENDER_BEVESTIG_VEREIST: ['Поставте позначку підтвердження.', 'Vink de bevestiging aan.'],
};
const uitslagTekst = (lang: Lang, v: string) => !v ? t(lang, 'немає даних', 'geen gegevens') : v === 'pass' ? t(lang, 'пройдено', 'geslaagd') : v === 'fail' ? t(lang, 'не пройдено', 'mislukt') : v;
const toon = (v: string) => (v === 'pass' ? 'ok' : v === 'fail' || v === 'softfail' ? 'slecht' : 'neutraal');

export default function AfzenderDialoog({ lang, from, info, messageId, accountId, onSluit, zonderContactenLink = false, bekendeAuth }: { lang: Lang; from: string; info: AfzenderInfo; messageId: string; accountId: string; onSluit: () => void; zonderContactenLink?: boolean; /** Al bekend Gmail-bewijs (contactenpagina, zonder bericht) — F5. */ bekendeAuth?: AuthUit }) {
  const [auth, setAuth] = useState<AuthUit | undefined>(undefined);
  const [naam, setNaam] = useState(info.naam || ''), [notitie, setNotitie] = useState(info.notitie || '');
  const [bevestig, setBevestig] = useState(false), [risico, setRisico] = useState(false);
  const [bezig, setBezig] = useState(false), [fout, setFout] = useState(''), [nuBezig, setNuBezig] = useState(false);
  const vak = useRef<HTMLDivElement | null>(null), eerste = useRef<HTMLInputElement | null>(null);
  const verdacht = info.status === 'verdacht';
  useEffect(() => {
    eerste.current?.focus();
    if (!messageId) { setAuth(bekendeAuth ?? null); return; }
    let weg = false;
    afzenderApi.controle(from, messageId, accountId).then((c) => { if (!weg) setAuth(c.auth); }).catch(() => { if (!weg) setAuth(null); });
    return () => { weg = true; };
  }, [from, messageId, accountId]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onSluit(); }
      if (e.key === 'Tab' && vak.current) {
        const f = [...vak.current.querySelectorAll<HTMLElement>('button,input,textarea')].filter((x) => !x.hasAttribute('disabled'));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [onSluit]);
  const opslaan = async () => {
    setFout('');
    if (!bevestig) { setFout('AFZENDER_BEVESTIG_VEREIST'); return; }
    if (verdacht && !risico) { setFout('AFZENDER_VERDACHT_BEVESTIG'); return; }
    setBezig(true);
    try {
      const r = await afzenderApi.verifieren({ from, naam, notitie, ookVerdacht: verdacht && risico });
      afzenderGewijzigd(info.adres, { status: 'geverifieerd', bron: 'handmatig', reden: 'HANDMATIG', naam: r?.naam || naam, opgeslagen: true });
      onSluit();
    } catch (e) { setFout(foutCode(e)); }
    setBezig(false);
  };
  const controleerNu = async () => {
    setFout(''); setNuBezig(true);
    try {
      const r = await afzenderApi.nu({ from, adres: info.adres, messageId, accountId });
      if (r?.auth) setAuth(r.auth);
      else if (r && !messageId) setAuth(bekendeAuth ?? r.auth);
    } catch (e) { setFout(foutCode(e)); }
    setNuBezig(false);
  };
  const rij = (label: string, v: string, extra = '') => <div className='afz-auth-rij'><dt>{label}</dt><dd data-toon={toon(v)}>{uitslagTekst(lang, v)}{extra && <small> · {extra}</small>}</dd></div>;
  return createPortal(<div className='afz-laag' onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onSluit(); }} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onKeyUp={(e) => e.stopPropagation()}>
    {/* React-gebeurtenissen lopen door een portal heen naar de rij: hier stoppen, anders opent Enter/spatie het bericht. */}
    <div ref={vak} className='afz-dialoog' role='dialog' aria-modal='true' aria-labelledby='afz-dialoog-titel'>
      <header>
        <h2 id='afz-dialoog-titel'>{t(lang, 'Перевірити відправника вручну', 'Afzender zelf controleren')}</h2>
        <button type='button' className='afz-sluit' aria-label={t(lang, 'Закрити', 'Sluiten')} onClick={onSluit}><X aria-hidden='true' style={{ width: 18, height: 18 }} /></button>
      </header>
      <div className={`afz-melding afz-melding-${info.status}`} role='status'>
        <strong>{verdacht ? t(lang, 'Увага: можливе видавання себе за інший сервіс', 'Let op: mogelijke imitatie van een andere dienst') : t(lang, 'Не підтверджено', 'Niet bevestigd')}</strong>
        <p>{redenTekst(info.reden, lang)}</p>
      </div>
      <dl className='afz-gegevens'>
        <div><dt>{t(lang, 'Адреса', 'Adres')}</dt><dd className='afz-mono'>{info.adres}</dd></div>
        <div><dt>{t(lang, 'Домен', 'Domein')}</dt><dd className='afz-mono'>{info.domein}</dd></div>
      </dl>
      <section className='afz-auth' aria-live='polite'>
        <h3>{t(lang, 'Перевірки доставки (Gmail)', 'Bezorgcontroles (Gmail)')}</h3>
        {auth === undefined ? <p className='afz-stil'>{t(lang, 'Завантаження…', 'Laden…')}</p>
          : !auth || !auth.betrouwbaar ? <p className='afz-stil'>{t(lang, 'Немає даних перевірки від Gmail для цього листа. Рішення лише за вами.', 'Geen controlegegevens van Gmail voor dit bericht. De beslissing ligt bij u.')}</p>
            : <dl>{rij('SPF', auth.spf)}{rij('DKIM', auth.dkim.find((k) => k.uitslag === 'pass')?.uitslag || auth.dkim[0]?.uitslag || '', auth.dkim.find((k) => k.uitslag === 'pass')?.domein || auth.dkim[0]?.domein || '')}{rij('DMARC', auth.dmarc, auth.dmarcDomein)}</dl>}
        <p className='afz-stil' data-nu-uitleg>{NU_UITLEG[lang === 'uk' ? 0 : 1]}</p>
        <button type='button' className='afz-knop' data-actie='nu' disabled={nuBezig} onClick={() => void controleerNu()}>{nuBezig ? t(lang, 'Перевіряю…', 'Controleren…') : t(lang, 'Перевірити зараз', 'Nu controleren')}</button>
        <p className='afz-stil'>{t(lang, 'Пройдена перевірка означає лише, що лист справді з цього домену, а не що домену можна довіряти.', 'Een geslaagde controle betekent alleen dat het bericht echt van dit domein komt, niet dat het domein te vertrouwen is.')}</p>
      </section>
      <label className='afz-veld'><span>{t(lang, 'Ім’я в контактах', 'Naam in contacten')}</span><input ref={eerste} value={naam} maxLength={200} onChange={(e) => setNaam(e.target.value)} /></label>
      <label className='afz-veld'><span>{t(lang, 'Нотатка (необов’язково)', 'Notitie (optioneel)')}</span><textarea value={notitie} maxLength={500} rows={2} onChange={(e) => setNotitie(e.target.value)} /></label>
      <label className='afz-vink'><input type='checkbox' checked={bevestig} onChange={(e) => setBevestig(e.target.checked)} /><span>{t(lang, 'Я знаю цього відправника і підтверджую, що ця адреса справжня.', 'Ik ken deze afzender en bevestig dat dit adres echt is.')}</span></label>
      {verdacht && <label className='afz-vink afz-vink-risico'><input type='checkbox' checked={risico} onChange={(e) => setRisico(e.target.checked)} /><span>{t(lang, 'Я розумію попередження і все одно позначаю відправника як перевіреного.', 'Ik begrijp de waarschuwing en markeer de afzender toch als bevestigd.')}</span></label>}
      {fout && <p className='afz-fout' role='alert'>{(FOUTEN[fout] || [fout, fout])[lang === 'uk' ? 0 : 1]}</p>}
      <footer>
        {!zonderContactenLink && <button type='button' className='afz-alle-contacten afz-dialoog-contacten' onClick={() => { onSluit(); void openContacten(info.adres, lang); }}>{t(lang, 'Усі контакти', 'Alle contacten')}</button>}
        <button type='button' className='afz-knop' onClick={onSluit}>{t(lang, 'Скасувати', 'Annuleren')}</button>
        <button type='button' className='afz-knop afz-knop-hoofd' disabled={bezig} onClick={() => void opslaan()}>{bezig ? t(lang, 'Збереження…', 'Opslaan…') : t(lang, 'Зберегти в контакти', 'Bewaren in contacten')}</button>
      </footer>
    </div>
  </div>, document.body);
}
