// IDENTITEIT-015 (крок «aanmelden»): два рядки в «Способах входу» → «Вхід» (стара панель src/toegangslaag-panelen.tsx):
//   • «Повернути спосіб входу» — від'єднаний спосіб (пароль, Google, номер…) протягом 7 днів: діалог із наслідками → step-up на сервері
//     (POST /api/owner/access/method/herstel). Раніше сервер це вмів, а кнопки не було, хоча діалог і сповіщення її обіцяли;
//   • «Телефон (SMS)» — номер у міжнародному форматі, «Надіслати код» і поле коду: pending → verified (прапорець aanmelden-sms,
//     провайдер власника). Без провайдера — чесна передумова з сервера (де саме власник вводить ключ).
// Twee rijen: een ontkoppelde methode binnen 7 dagen terugzetten, en het telefoonnummer bevestigen met een sms-code.
import { useState } from 'react';
import { RotateCcw, Send, Smartphone } from 'lucide-react';
import { BevestigDialoog } from '../platform/BevestigDialoog';
import { api } from '../platform/client';
import { aanmeldWeigering } from '../weigeringen';
import type { Lang } from '../toegangslaag-teksten';

const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);
type Herstelbaar = { id: string; soort: string; method: string; herstelTot: number; zelf: boolean; doorBeheer: boolean };
type Telefoon = { configured: boolean; verified: boolean; pending?: boolean; value: string; sms?: { vlag: boolean; klaar: boolean; voorwaarde: [string, string] | null; codeTot: number } };
const NAAM: Record<string, [string, string]> = { password: ['Пароль', 'Wachtwoord'], google: ['Google', 'Google'], phone: ['Телефон', 'Telefoon'], microsoft: ['Microsoft', 'Microsoft'], apple: ['Apple', 'Apple'], facebook: ['Facebook', 'Facebook'] };
const datum = (lang: Lang, t: number) => new Date(t).toLocaleDateString(lang === 'nl' ? 'nl-BE' : 'uk-UA', { day: 'numeric', month: 'long' });

export function AanmeldWegenExtra({ lang, herstelbaar = [], telefoon, context, write, load }: { lang: Lang; herstelbaar?: Herstelbaar[]; telefoon?: Telefoon; context: Record<string, unknown>; write: (route: string, payload?: Record<string, unknown>) => Promise<void>; load: () => Promise<void> }) {
  const [terug, setTerug] = useState<Herstelbaar | null>(null);
  const [nummer, setNummer] = useState('');
  const [code, setCode] = useState('');
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState('');
  const [codeVerstuurd, setCodeVerstuurd] = useState(0);
  const tekst = (e: unknown, standaard: [string, string]) => { const p = aanmeldWeigering(e) || standaard; return lang === 'nl' ? p[1] : p[0]; };
  const roep = async (pad: string, body: Record<string, unknown>, ok: (d: Record<string, unknown>) => void) => {
    if (bezig) return; // повторне натискання під час запиту — нічого
    setBezig(true); setMelding('');
    try { const d = (await api.post(pad, { ...context, ...body })).data as Record<string, unknown>; ok(d); await load(); }
    catch (e) { setMelding(tekst(e, ['Не вдалося. Нічого не змінено — спробуйте ще раз.', 'Niet gelukt. Er is niets gewijzigd — probeer opnieuw.'])); }
    finally { setBezig(false); }
  };
  const sms = telefoon?.sms;
  const voorwaarde = sms?.voorwaarde ? (lang === 'nl' ? sms.voorwaarde[1] : sms.voorwaarde[0]) : '';
  const wachtOpCode = Boolean(telefoon?.pending && (codeVerstuurd > Date.now() || Number(sms?.codeTot || 0) > Date.now()));

  return <>
    <BevestigDialoog open={!!terug} id='methode-terugzetten' lang={lang} bezig={bezig}
      titel={tr(lang, `Повернути «${terug ? tr(lang, ...(NAAM[terug.method] || [terug.method, terug.method])) : ''}»?`, `«${terug ? tr(lang, ...(NAAM[terug.method] || [terug.method, terug.method])) : ''}» terugzetten?`)}
      uitleg={tr(lang, 'Спосіб входу знову діятиме так, як до від’єднання.', 'De aanmeldmethode werkt weer zoals vóór het ontkoppelen.')}
      gevolgen={[tr(lang, 'Сайт попросить підтвердити доступ (ключ доступу, код із застосунку або код відновлення).', 'De site vraagt om bevestiging van toegang (toegangssleutel, app-code of herstelcode).'), tr(lang, 'Ви отримаєте сповіщення «Спосіб входу відновлено».', 'U krijgt de melding «Aanmeldmethode teruggezet».')]}
      bevestigTekst={tr(lang, 'Так, повернути', 'Ja, terugzetten')}
      onAnnuleer={() => setTerug(null)}
      onBevestig={async () => { const t = terug; setTerug(null); if (t) await write('/api/owner/access/method/herstel', { id: t.id }); }} />
    {herstelbaar.length > 0 && <div className='access-plane-row' id='aanmeldmethoden-terugzetten' data-access-method='herstel' tabIndex={-1}>
      <RotateCcw className='access-plane-row-icon' />
      <div className='access-plane-row-main'>
        <span className='access-plane-row-title'><strong>{tr(lang, 'Повернути спосіб входу', 'Aanmeldmethode terugzetten')}</strong></span>
        <ul className='access-plane-terugzetten'>
          {herstelbaar.map((h) => <li key={h.id} data-terugzetten={h.method}>
            <span>{tr(lang, ...(NAAM[h.method] || [h.method, h.method]))} · {tr(lang, `можна повернути до ${datum(lang, h.herstelTot)}`, `terug te zetten tot ${datum(lang, h.herstelTot)}`)}</span>
            {h.zelf
              ? <button type='button' className='secondary' disabled={bezig} onClick={() => setTerug(h)}><RotateCcw />{tr(lang, 'Повернути', 'Terugzetten')}</button>
              : <small>{tr(lang, 'Від’єднав адміністратор — повернути може лише він.', 'Ontkoppeld door een beheerder — alleen die kan het terugzetten.')}</small>}
          </li>)}
        </ul>
      </div>
    </div>}
    <div className='access-plane-row' id='aanmeldmethoden-telefoon' data-access-method='phone' data-telefoon={telefoon?.verified ? 'bevestigd' : telefoon?.pending ? 'wacht' : 'geen'} tabIndex={-1}>
      <Smartphone className='access-plane-row-icon' />
      <div className='access-plane-row-main'>
        <span className='access-plane-row-title'><strong>{tr(lang, 'Телефон (SMS)', 'Telefoon (sms)')}</strong>
          <span className={`access-plane-badge tone-${telefoon?.verified ? 'good' : telefoon?.pending ? 'warn' : 'muted'}`}>{telefoon?.verified ? tr(lang, 'Підтверджено', 'Bevestigd') : telefoon?.pending ? tr(lang, 'Чекає підтвердження', 'Wacht op bevestiging') : tr(lang, 'Немає', 'Geen')}</span></span>
        <small>{telefoon?.value ? telefoon.value : tr(lang, 'Номер для другого каналу зв’язку. Входу за номером немає; номер підтверджується кодом із SMS.', 'Nummer als tweede kanaal. Aanmelden met het nummer kan niet; het nummer wordt bevestigd met een sms-code.')}</small>
        {voorwaarde && <small className='access-plane-warn' data-sms-voorwaarde>{voorwaarde}</small>}
        {!telefoon?.verified && <div className='access-plane-inline-form'>
          <input type='tel' inputMode='tel' autoComplete='tel' placeholder='+31612345678' value={nummer} onChange={(e) => setNummer(e.target.value.replace(/[^\d+]/g, '').slice(0, 16))} aria-label={tr(lang, 'Номер у міжнародному форматі', 'Nummer in internationaal formaat')} />
          <button type='button' className='secondary' disabled={bezig || nummer.length < 9} onClick={() => void roep('/api/owner/access/phone/save', { phone: nummer }, () => { setNummer(''); setMelding(tr(lang, 'Номер збережено. Тепер надішліть код.', 'Nummer opgeslagen. Verstuur nu de code.')); })}>{tr(lang, 'Зберегти номер', 'Nummer opslaan')}</button>
          {telefoon?.pending && sms?.klaar && <button type='button' disabled={bezig} onClick={() => void roep('/api/owner/access/phone/code/versturen', {}, (d) => { setCodeVerstuurd(Number(d.geldigTot || 0)); setMelding(d.alBevestigd ? tr(lang, 'Номер уже підтверджено.', 'Het nummer is al bevestigd.') : tr(lang, `Код надіслано на ${String(d.naar || '')}. Він діє 10 хвилин.`, `Code verstuurd naar ${String(d.naar || '')}. Hij geldt 10 minuten.`)); })}><Send />{wachtOpCode ? tr(lang, 'Надіслати ще раз', 'Opnieuw versturen') : tr(lang, 'Надіслати код', 'Code versturen')}</button>}
        </div>}
        {!telefoon?.verified && wachtOpCode && <div className='access-plane-inline-form'>
          <input inputMode='numeric' autoComplete='one-time-code' maxLength={6} aria-label={tr(lang, 'Код із SMS для підтвердження номера (6 цифр)', 'Sms-code om het nummer te bevestigen (6 cijfers)')} placeholder={tr(lang, '6 цифр із SMS', '6 cijfers uit de sms')} value={code} onChange={(e) => setCode(e.target.value.replace(/\D+/g, '').slice(0, 6))} />
          <button type='button' disabled={bezig || code.length !== 6} onClick={() => void roep('/api/owner/access/phone/code/bevestigen', { code }, () => { setCode(''); setMelding(tr(lang, 'Номер підтверджено.', 'Nummer bevestigd.')); })}>{tr(lang, 'Підтвердити номер', 'Nummer bevestigen')}</button>
        </div>}
        {melding && <small role='status' aria-live='polite' data-telefoon-melding>{melding}</small>}
      </div>
    </div>
  </>;
}
