// Gemeenschappelijke bouwstenen: een knop met aftelling, en het bevestigingsvenster voor TELEGRAM_BEVESTIGING_NODIG.
// Het venster legt ALTIJD uit waarom het iets vraagt (welke handeling, welke methode, wat er gebeurt bij «Ні»).
import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
// APPARAAT-001: vierde methode «ander apparaat» in hetzelfde venster.
const StapOpKanaal = lazy(() => import('../apparaat-bevestiging/StapOpKanaal'));
import { api } from '../platform/client';
import { bevestigToegang } from '../platform/stap-op';
import { BevestigingNodig, foutTekst, tgPost, type Ctx, type Nodig } from './api';
import TelegramLogo from './TelegramLogo';
import { METHODE_NAMEN } from '../../shared/telegram-aanmelden/beleid';
import { tekstIn } from '../../shared/telegram-aanmelden/model';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);

/** Knop die pas na `seconden` werkt; toont de resterende tijd in de knop zelf. Dubbel tikken doet niets (bezig). */
export function AftelKnop({ seconden, onClick, children, className = 'tga-knop tga-knop-hoofd', bezig = false, uit = false, lang }: { seconden: number; onClick: () => void; children: ReactNode; className?: string; bezig?: boolean; uit?: boolean; lang: Lang }) {
  const [rest, setRest] = useState(seconden);
  useEffect(() => { setRest(seconden); if (seconden <= 0) return; const start = Date.now(); const t = window.setInterval(() => { const r = Math.max(0, seconden - Math.floor((Date.now() - start) / 1000)); setRest(r); if (r === 0) window.clearInterval(t); }, 250); return () => window.clearInterval(t); }, [seconden]);
  const dicht = rest > 0 || bezig || uit;
  return <button type='button' className={className} disabled={dicht} aria-disabled={dicht} onClick={() => { if (!dicht) onClick(); }}>
    {children}{rest > 0 && <span className='tga-aftel' aria-live='polite'> · {tr(lang, `зачекайте ${rest} с`, `wacht ${rest} s`)}</span>}{bezig && <span className='tga-draai' aria-hidden='true' />}
  </button>;
}

/** Eén klik = één verzoek: tweede tik terwijl het eerste loopt wordt genegeerd. */
export function useEenmalig() {
  const loopt = useRef(false);
  const [bezig, setBezig] = useState(false);
  const doe = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (loopt.current) return undefined;
    loopt.current = true; setBezig(true);
    try { return await fn(); } finally { loopt.current = false; setBezig(false); }
  }, []);
  return { bezig, doe };
}

type Open = { nodig: Nodig; klaar: (ok: boolean) => void };

/**
 * useBevestiging(): `uitvoeren(fn)` voert fn uit; vraagt de server een extra bevestiging (Telegram, geheime code of toegangssleutel),
 * dan opent het venster, en na bevestiging probeert het fn opnieuw (hoogstens 3 rondes). «Скасувати» = niets gewijzigd.
 */
export function useBevestiging(ctx: Ctx, lang: Lang) {
  const [open, setOpen] = useState<Open | null>(null);
  const uitvoeren = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    for (let ronde = 0; ; ronde++) {
      try { return await fn(); }
      catch (e) {
        if (!(e instanceof BevestigingNodig) || ronde >= 3) throw e;
        // Alleen een toegangssleutel ontbreekt → meteen het bestaande passkey-venster (zelfde als elders op de site).
        if (e.nodig.ontbreekt.length === 1 && e.nodig.ontbreekt[0] === 'passkey') {
          const uit = await bevestigToegang({ service: ctx.service, tabContext: ctx.tabContext, post: (u, d) => api.post(u, d), toegestaan: ['passkey'], sterk: true });
          if (!uit.ok) throw new Error('PASSKEY_GEANNULEERD');
          continue;
        }
        const ok = await new Promise<boolean>((klaar) => setOpen({ nodig: e.nodig, klaar }));
        setOpen(null);
        if (!ok) throw new Error('GEANNULEERD');
      }
    }
  }, [ctx]);
  const venster = open ? <BevestigVenster ctx={ctx} lang={lang} nodig={open.nodig} klaar={open.klaar} /> : null;
  return { uitvoeren, venster };
}

function BevestigVenster({ ctx, lang, nodig, klaar }: { ctx: Ctx; lang: Lang; nodig: Nodig; klaar: (ok: boolean) => void }) {
  const [stap, setStap] = useState<'kies' | 'telegram' | 'apparaat' | 'code'>(nodig.ontbreekt.includes('telegram') ? 'telegram' : nodig.ontbreekt.includes('apparaat') ? 'apparaat' : nodig.ontbreekt.includes('code') ? 'code' : 'kies');
  const [fout, setFout] = useState('');
  const [info, setInfo] = useState('');
  const [code, setCode] = useState('');
  const [gedaan, setGedaan] = useState<string[]>([]);
  const { bezig, doe } = useEenmalig();
  const verzoek = useRef('');
  const rest = nodig.ontbreekt.filter((m) => !gedaan.includes(m));

  const volgende = (klaarMet: string) => {
    const nog = rest.filter((m) => m !== klaarMet);
    setGedaan((g) => [...g, klaarMet]);
    if (nog.length === 0) { klaar(true); return; }
    if (nog.includes('telegram')) setStap('telegram');
    else if (nog.includes('apparaat')) setStap('apparaat');
    else if (nog.includes('code')) setStap('code');
    else if (nog.includes('passkey')) void (async () => {
      const uit = await bevestigToegang({ service: ctx.service, tabContext: ctx.tabContext, post: (u, d) => api.post(u, d), toegestaan: ['passkey'], sterk: true });
      klaar(uit.ok);
    })();
    else klaar(true);
  };

  // Telegram: verzoek sturen en elke 2 s de stand lezen. «Ні» in Telegram wint altijd.
  useEffect(() => {
    if (stap !== 'telegram') return;
    let actief = true; let t = 0;
    void (async () => {
      try {
        const r = await tgPost<{ id: string; verlooptOp: string; verstuurd: number }>(ctx, '/api/owner/telegram/bevestiging/aanvragen', { actie: nodig.actie });
        verzoek.current = r.id;
        setInfo(tr(lang, `Запит надіслано у ваш Telegram (${r.verstuurd}). Відкрийте чат із ботом і натисніть «Так, це я».`, `Verzoek verstuurd naar uw Telegram (${r.verstuurd}). Open de chat met de bot en tik «Ja, dit ben ik».`));
        const kijk = async () => {
          if (!actief) return;
          try {
            const s = await tgPost<{ stand: string }>(ctx, '/api/owner/telegram/bevestiging/status', { id: r.id });
            if (s.stand === 'bevestigd') { volgende('telegram'); return; }
            if (s.stand === 'geweigerd') { setFout(tr(lang, 'Ви натиснули «Ні» в Telegram — дію скасовано, нічого не змінено.', 'U tikte «Nee» in Telegram — de handeling is geannuleerd, er is niets gewijzigd.')); return; }
            if (s.stand === 'verlopen') { setFout(tr(lang, 'Час на підтвердження вийшов. Спробуйте ще раз.', 'De tijd om te bevestigen is om. Probeer het opnieuw.')); return; }
          } catch { /* tijdelijke netwerkfout: gewoon opnieuw */ }
          t = window.setTimeout(kijk, 2000);
        };
        t = window.setTimeout(kijk, 1500);
      } catch (e) { if (actief) setFout(foutTekst(lang, e)); }
    })();
    return () => { actief = false; window.clearTimeout(t); };
  }, [stap]); // eslint-disable-line react-hooks/exhaustive-deps

  const codeSturen = () => doe(async () => {
    setFout('');
    try {
      const r = await tgPost<{ ok: boolean; uitkomst: string }>(ctx, '/api/owner/telegram/bevestiging/code', { actie: nodig.actie, code });
      setCode('');
      if (r.ok) { volgende('code'); return; }
      setFout(r.uitkomst === 'pauze' ? tr(lang, 'Забагато невдалих спроб. Код тимчасово призупинено — спробуйте пізніше або іншим способом.', 'Te veel mislukte pogingen. De code is tijdelijk gepauzeerd — probeer later of op een andere manier.')
        : r.uitkomst === 'uit' ? tr(lang, 'Код вимкнено після багатьох помилок. Відновіть його у «Способах входу» з ключем доступу.', 'De code is na te veel fouten uitgeschakeld. Herstel hem bij «Aanmeldmethoden» met uw toegangssleutel.')
          : tr(lang, 'Код не підходить. Перевірте й спробуйте ще раз.', 'De code klopt niet. Controleer en probeer opnieuw.'));
    } catch (e) { setFout(foutTekst(lang, e)); }
  });

  const methoden = nodig.ontbreekt.map((m) => tekstIn(METHODE_NAMEN[m as keyof typeof METHODE_NAMEN] ?? [m, m], lang)).join(' + ');
  // APPARAAT-001: een alternatief dat uit één andere methode bestaat (bv. [['telegram'],['apparaat']]) mag de gebruiker zelf kiezen.
  const losAlternatief = (m: 'telegram' | 'apparaat') => m !== stap && !gedaan.includes(m) && !!nodig.eis?.some((a) => a.length === 1 && a[0] === m);
  return <div className='tga-scherm' role='dialog' aria-modal='true' aria-labelledby='tga-bev-titel'>
    <div className='tga-venster'>
      <h2 id='tga-bev-titel'><TelegramLogo maat={28} /> {tr(lang, 'Підтвердіть, що це ви', 'Bevestig dat u het bent')}</h2>
      <p className='tga-waarom'>{tr(lang, `Для цієї дії ваші налаштування вимагають: ${methoden}. Так ніхто інший не зможе зробити це від вашого імені, навіть маючи доступ до цього браузера.`,
        `Voor deze handeling vragen uw instellingen: ${methoden}. Zo kan niemand anders dit namens u doen, ook niet met toegang tot deze browser.`)}</p>
      {stap === 'telegram' && <div className='tga-blok'>
        <p>{info || tr(lang, 'Надсилаємо запит у Telegram…', 'Verzoek naar Telegram sturen…')}</p>
        {!fout && <p className='tga-wacht'><span className='tga-draai' aria-hidden='true' /> {tr(lang, 'Чекаємо на вашу відповідь у Telegram…', 'Wachten op uw antwoord in Telegram…')}</p>}
        {nodig.ontbreekt.includes('code') && <p className='tga-klein'>{tr(lang, 'Потім ще попросимо ваш таємний код.', 'Daarna vragen we nog uw geheime code.')}</p>}
      </div>}
      {stap === 'apparaat' && <div className='tga-blok'>
        <Suspense fallback={<p>{tr(lang, 'Завантаження…', 'Laden…')}</p>}>
          <StapOpKanaal kanaal='apparaat' ctx={{ service: ctx.service, tabContext: ctx.tabContext }} lang={lang} matrixActie={nodig.actie} naPoort={false} onKlaar={() => volgende('apparaat')} />
        </Suspense>
      </div>}
      {(losAlternatief('apparaat') || losAlternatief('telegram')) && <p className='tga-klein'>
        {losAlternatief('apparaat') && <button type='button' className='tga-link' onClick={() => { setFout(''); setStap('apparaat'); }}>{tr(lang, 'Або підтвердити з іншого пристрою', 'Of bevestigen vanaf een ander apparaat')}</button>}
        {losAlternatief('telegram') && <button type='button' className='tga-link' onClick={() => { setFout(''); setStap('telegram'); }}>{tr(lang, 'Або підтвердити в Telegram', 'Of bevestigen in Telegram')}</button>}
      </p>}
      {stap === 'code' && <form className='tga-blok' onSubmit={(e) => { e.preventDefault(); void codeSturen(); }}>
        <label htmlFor='tga-bev-code'>{tr(lang, 'Ваш таємний код', 'Uw geheime code')}</label>
        <input id='tga-bev-code' type='password' inputMode='text' autoComplete='off' value={code} onChange={(e) => setCode(e.target.value)} maxLength={64} autoFocus />
        <p className='tga-klein'>{tr(lang, 'Ніколи не надсилайте цей код у чат Telegram — бот його одразу видалить і вимкне код.', 'Stuur deze code nooit in de Telegram-chat — de bot verwijdert hem meteen en zet de code uit.')}</p>
        <button type='submit' className='tga-knop tga-knop-hoofd' disabled={bezig || code.length < 4}>{tr(lang, 'Підтвердити', 'Bevestigen')}{bezig && <span className='tga-draai' aria-hidden='true' />}</button>
      </form>}
      {fout && <p className='tga-fout' role='alert'>{fout}</p>}
      <div className='tga-rij'><button type='button' className='tga-knop' onClick={() => klaar(false)}>{tr(lang, 'Скасувати — нічого не змінювати', 'Annuleren — niets wijzigen')}</button></div>
    </div>
  </div>;
}
