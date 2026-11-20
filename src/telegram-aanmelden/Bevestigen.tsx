// Gemeenschappelijke bouwstenen: een knop met aftelling, en het bevestigingsvenster voor TELEGRAM_BEVESTIGING_NODIG.
// Het venster legt ALTIJD uit waarom het iets vraagt (welke handeling, welke methode, wat er gebeurt bij «Ні»).
import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import TelegramWie, { geldigePersonen, type TelegramPersoon } from './TelegramWie';
// APPARAAT-001: vierde methode «ander apparaat» in hetzelfde venster.
const StapOpKanaal = lazy(() => import('../apparaat-bevestiging/StapOpKanaal'));
import { api } from '../platform/client';
import { bevestigToegang } from '../platform/stap-op';
import { BevestigingNodig, foutTekst, tgPost, type Ctx, type Nodig } from './api';
import TelegramLogo from './TelegramLogo';
import PictogramTegel from '../apparaat-bevestiging/PictogramTegel';
import { pictogramTegel } from '../../shared/apparaat-bevestiging/symbolen';
import { METHODE_NAMEN } from '../../shared/telegram-aanmelden/beleid';
import { tekstIn } from '../../shared/telegram-aanmelden/model';
import { aanmeldPauzeBericht, useAftelPauze } from '../aanmeld-pauze';

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
type BekendeMethode = 'telegram' | 'apparaat' | 'code' | 'passkey';
const BEKENDE_METHODEN = new Set<string>(['telegram', 'apparaat', 'code', 'passkey']);

const setSleutel = (s: readonly string[]): string => [...new Set(s)].sort().join('+');

/** Усі здійсненні унікальні альтернативні набори з nodig.eis (жоден елемент не в nodig.onbeschikbaar). */
function uitvoerbareAlternatieven(nodig: Nodig): string[][] {
  const uit = new Set(nodig.onbeschikbaar || []);
  const bron = Array.isArray(nodig.eis) && nodig.eis.length > 0 ? nodig.eis : [nodig.ontbreekt];
  const gezien = new Set<string>();
  const lijst: string[][] = [];
  for (const alt of bron) {
    if (!Array.isArray(alt) || alt.length === 0) continue;
    const schoon = [...new Set(alt.filter((m) => BEKENDE_METHODEN.has(m)))];
    if (schoon.length !== alt.length) continue;
    if (schoon.some((m) => uit.has(m))) continue;
    const k = setSleutel(schoon);
    if (gezien.has(k)) continue;
    gezien.add(k);
    lijst.push(schoon);
  }
  return lijst;
}

function beginSetVan(nodig: Nodig, alternatieven: string[][]): string[] {
  const gezocht = setSleutel(nodig.ontbreekt);
  const exact = alternatieven.find((a) => setSleutel(a) === gezocht);
  if (exact) return exact;
  const bevat = alternatieven.find((a) => nodig.ontbreekt.every((m) => a.includes(m)));
  return bevat || alternatieven[0] || nodig.ontbreekt;
}

function volgendeStapVoor(set: readonly string[], gedaan: readonly string[]): 'telegram' | 'apparaat' | 'code' | 'passkey' | 'kies' {
  const nog = set.filter((m) => !gedaan.includes(m));
  if (nog.includes('telegram')) return 'telegram';
  if (nog.includes('apparaat')) return 'apparaat';
  if (nog.includes('code')) return 'code';
  if (nog.includes('passkey')) return 'passkey';
  return 'kies';
}

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
        // Якщо єдиний здійсненний варіант — ключ доступу, відкриваємо одразу стандартне вікно ключа доступу.
        const alts = uitvoerbareAlternatieven(e.nodig);
        const alleenPasskey = e.nodig.ontbreekt.length === 1 && e.nodig.ontbreekt[0] === 'passkey'
          && alts.every((a) => a.length === 1 && a[0] === 'passkey');
        if (alleenPasskey) {
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
  const alternatieven = uitvoerbareAlternatieven(nodig);
  const [gekozenSet, setGekozenSet] = useState<string[]>(() => beginSetVan(nodig, alternatieven));
  const [stap, setStap] = useState<'kies' | 'telegram' | 'apparaat' | 'code' | 'passkey'>(() => volgendeStapVoor(beginSetVan(nodig, alternatieven), []));
  const [fout, setFout] = useState('');
  const [info, setInfo] = useState('');
  const [code, setCode] = useState('');
  // TELEGRAM-002: juist pictogram voor het beveiligde Telegram-venster (alleen deze browser kent het).
  const [pictogram, setPictogram] = useState<number | null>(null);
  const [ontvangers, setOntvangers] = useState<TelegramPersoon[]>([]);
  const [gedaan, setGedaan] = useState<string[]>([]);
  const [telegramPoging, setTelegramPoging] = useState(0);
  const { bezig, doe } = useEenmalig();
  const { actief: pauzeActief, resterend: pauzeRest, zojuistVrij: pauzeVrij, limiet: pauzeLimiet, startPauze, vangPauze, wis: wisPauze } = useAftelPauze();
  const pauzeTekst = pauzeActief || pauzeVrij
    ? aanmeldPauzeBericht(Math.max(1, pauzeRest), lang, 'bevestig', pauzeLimiet)
    : null;
  const verzoek = useRef('');

  const startPasskey = useCallback((doelSet: string[], huidigeGedaan: string[]) => doe(async () => {
    setFout('');
    const uit = await bevestigToegang({ service: ctx.service, tabContext: ctx.tabContext, post: (u, d) => api.post(u, d), toegestaan: ['passkey'], sterk: true });
    if (!uit.ok) {
      setFout(tr(lang, 'Підтвердження ключем доступу скасовано. Спробуйте ще раз або оберіть інший спосіб нижче.', 'Bevestiging met toegangssleutel geannuleerd. Probeer opnieuw of kies hieronder een andere methode.'));
      return;
    }
    const nieuwGedaan = huidigeGedaan.includes('passkey') ? huidigeGedaan : [...huidigeGedaan, 'passkey'];
    setGedaan(nieuwGedaan);
    const nog = doelSet.filter((m) => !nieuwGedaan.includes(m));
    if (nog.length === 0) { klaar(true); return; }
    setStap(volgendeStapVoor(doelSet, nieuwGedaan));
  }), [ctx.service, ctx.tabContext, doe, klaar, lang]);

  const volgende = (klaarMet: string, bronSet: string[] = gekozenSet) => {
    const nieuwGedaan = gedaan.includes(klaarMet) ? gedaan : [...gedaan, klaarMet];
    setGedaan(nieuwGedaan);
    const nog = bronSet.filter((m) => !nieuwGedaan.includes(m));
    if (nog.length === 0) { klaar(true); return; }
    const eerstvolgende = volgendeStapVoor(bronSet, nieuwGedaan);
    setStap(eerstvolgende);
    if (eerstvolgende === 'passkey') void startPasskey(bronSet, nieuwGedaan);
  };

  const kiesAlternatief = (doelSet: string[]) => {
    setFout('');
    setGekozenSet(doelSet);
    const eerstvolgende = volgendeStapVoor(doelSet, gedaan);
    if (eerstvolgende === 'kies') { klaar(true); return; }
    setStap(eerstvolgende);
    if (eerstvolgende === 'passkey') void startPasskey(doelSet, gedaan);
  };

  // Telegram: verzoek sturen en elke 2 s de stand lezen. «Ні» in Telegram wint altijd.
  useEffect(() => {
    if (stap !== 'telegram') return;
    let actief = true; let t = 0;
    void (async () => {
      try {
        const r = await tgPost<{ id: string; verlooptOp: string; verstuurd: number; venster?: boolean; kandidaten?: number[]; juist?: number; codeNodig?: boolean; ontvangers?: unknown }>(ctx, '/api/owner/telegram/bevestiging/aanvragen', { actie: nodig.actie });
        verzoek.current = r.id;
        const p = r.venster && r.kandidaten && typeof r.juist === 'number' ? r.kandidaten[r.juist] : null;
        setPictogram(typeof p === 'number' ? p : null);
        setOntvangers(geldigePersonen(r.ontvangers));
        if (typeof p === 'number') {
          const naam = pictogramTegel(p, lang)?.naam ?? '';
          setInfo(tr(lang, `Запит надіслано у ваш Telegram (${r.verstuurd}). Натисніть там «Перевірити й підтвердити» і оберіть піктограму «${naam}»${r.codeNodig ? ', потім введіть таємний код у тому ж вікні' : ''}.`,
            `Verzoek verstuurd naar uw Telegram (${r.verstuurd}). Tik daar «Controleren en bevestigen» en kies het pictogram «${naam}»${r.codeNodig ? ', vul daarna uw geheime code in hetzelfde venster in' : ''}.`));
        } else setInfo(tr(lang, `Запит надіслано у ваш Telegram (${r.verstuurd}). Відкрийте чат із ботом і натисніть «Так, це я».`, `Verzoek verstuurd naar uw Telegram (${r.verstuurd}). Open de chat met de bot en tik «Ja, dit ben ik».`));
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
      } catch (e) {
        if (actief) {
          const p = vangPauze(e);
          if (!p.isPauze) setFout(foutTekst(lang, e));
        }
      }
    })();
    return () => { actief = false; window.clearTimeout(t); };
  }, [stap, telegramPoging, vangPauze]); // eslint-disable-line react-hooks/exhaustive-deps

  const codeSturen = () => doe(async () => {
    if (pauzeActief) return;
    setFout('');
    try {
      const r = await tgPost<{ ok: boolean; uitkomst: string }>(ctx, '/api/owner/telegram/bevestiging/code', { actie: nodig.actie, code });
      setCode('');
      if (r.ok) { wisPauze(); volgende('code'); return; }
      if (r.uitkomst === 'pauze') { startPauze(60); return; }
      setFout(r.uitkomst === 'uit'
        ? tr(lang, 'Код вимкнено після багатьох помилок. Відновіть його у «Способах входу» з ключем доступу.', 'De code is na te veel fouten uitgeschakeld. Herstel hem bij «Aanmeldmethoden» met uw toegangssleutel.')
        : tr(lang, 'Код не підходить. Перевірте й спробуйте ще раз.', 'De code klopt niet. Controleer en probeer opnieuw.'));
    } catch (e) {
      const p = vangPauze(e);
      if (!p.isPauze) setFout(foutTekst(lang, e));
    }
  });

  const labelVoorSet = (s: readonly string[]) => s.map((m) => tekstIn(METHODE_NAMEN[m as BekendeMethode] ?? [m, m], lang)).join(' + ');
  const methoden = labelVoorSet(gekozenSet);
  // UPD-012: усі здійсненні альтернативні набори з nodig.eis (включно з passkey, apparaat, telegram і складеними комбінаціями).
  const actieveSleutel = setSleutel(gekozenSet);
  const andereAlternatieven = alternatieven.filter((alt) => setSleutel(alt) !== actieveSleutel);
  const nogCodeNodig = gekozenSet.includes('code') && !gedaan.includes('code');

  return <div className='tga-scherm' role='dialog' aria-modal='true' aria-labelledby='tga-bev-titel'>
    <div className='tga-venster'>
      <h2 id='tga-bev-titel'><TelegramLogo maat={28} /> {tr(lang, 'Підтвердіть, що це ви', 'Bevestig dat u het bent')}</h2>
      <p className='tga-waarom'>{tr(lang, `Для цієї дії ваші налаштування вимагають: ${methoden}. Так ніхто інший не зможе зробити це від вашого імені, навіть маючи доступ до цього браузера.`,
        `Voor deze handeling vragen uw instellingen: ${methoden}. Zo kan niemand anders dit namens u doen, ook niet met toegang tot deze browser.`)}</p>
      {stap === 'telegram' && <div className='tga-blok'>
        {pictogram !== null && <div className='tg2-held'><PictogramTegel index={pictogram} lang={lang} groot /></div>}
        <TelegramWie lang={lang} personen={ontvangers} soort='verstuurd' />
        <p>{info || tr(lang, 'Надсилаємо запит у Telegram…', 'Verzoek naar Telegram sturen…')}</p>
        {!fout && !pauzeActief && <p className='tga-wacht'><span className='tga-draai' aria-hidden='true' /> {tr(lang, 'Чекаємо на вашу відповідь у Telegram…', 'Wachten op uw antwoord in Telegram…')}</p>}
        {(fout || pauzeActief || pauzeVrij) && !verzoek.current && <button type='button' className='tga-knop tga-knop-hoofd' disabled={pauzeActief} onClick={() => { if (!pauzeActief) { setFout(''); setTelegramPoging((n) => n + 1); } }}>{pauzeActief && pauzeTekst ? pauzeTekst.knop : tr(lang, 'Спробувати ще раз', 'Opnieuw proberen')}</button>}
        {nogCodeNodig && <p className='tga-klein'>{tr(lang, 'Потім ще попросимо ваш таємний код.', 'Daarna vragen we nog uw geheime code.')}</p>}
      </div>}
      {stap === 'apparaat' && <div className='tga-blok'>
        <Suspense fallback={<p>{tr(lang, 'Завантаження…', 'Laden…')}</p>}>
          <StapOpKanaal kanaal='apparaat' ctx={{ service: ctx.service, tabContext: ctx.tabContext }} lang={lang} matrixActie={nodig.actie} naPoort={false} onKlaar={() => volgende('apparaat')} />
        </Suspense>
        {nogCodeNodig && <p className='tga-klein'>{tr(lang, 'Потім ще попросимо ваш таємний код.', 'Daarna vragen we nog uw geheime code.')}</p>}
      </div>}
      {stap === 'passkey' && <div className='tga-blok'>
        <p>{tr(lang, 'Підтвердьте дію своїм ключем доступу (відбитком, обличчям, PIN-кодом або телефоном).', 'Bevestig de handeling met uw toegangssleutel (vingerafdruk, gezicht, pincode of telefoon).')}</p>
        <button type='button' className='tga-knop tga-knop-hoofd' disabled={bezig || pauzeActief} onClick={() => void startPasskey(gekozenSet, gedaan)}>
          {tr(lang, 'Підтвердити ключем доступу', 'Bevestigen met toegangssleutel')}{bezig && <span className='tga-draai' aria-hidden='true' />}
        </button>
        {nogCodeNodig && <p className='tga-klein'>{tr(lang, 'Потім ще попросимо ваш таємний код.', 'Daarna vragen we nog uw geheime code.')}</p>}
      </div>}
      {stap === 'code' && <form className='tga-blok' onSubmit={(e) => { e.preventDefault(); void codeSturen(); }}>
        <label htmlFor='tga-bev-code'>{tr(lang, 'Ваш таємний код', 'Uw geheime code')}</label>
        <input id='tga-bev-code' type='password' inputMode='text' autoComplete='off' value={code} onChange={(e) => setCode(e.target.value)} maxLength={64} autoFocus />
        <p className='tga-klein'>{tr(lang, 'Ніколи не надсилайте цей код у чат Telegram — бот його одразу видалить і вимкне код.', 'Stuur deze code nooit in de Telegram-chat — de bot verwijdert hem meteen en zet de code uit.')}</p>
        <button type='submit' className='tga-knop tga-knop-hoofd' disabled={bezig || pauzeActief || code.length < 4}>{pauzeActief && pauzeTekst ? pauzeTekst.knop : tr(lang, 'Підтвердити', 'Bevestigen')}{bezig && <span className='tga-draai' aria-hidden='true' />}</button>
      </form>}
      {andereAlternatieven.length > 0 && <div className='tga-klein' data-tga-alternatieven='1'>
        {andereAlternatieven.map((alt) => (
          <div key={setSleutel(alt)}>
            <button type='button' className='tga-link' disabled={bezig} onClick={() => kiesAlternatief(alt)}>
              {tr(lang, `Або підтвердити: ${labelVoorSet(alt)}`, `Of bevestigen met: ${labelVoorSet(alt)}`)}
            </button>
          </div>
        ))}
      </div>}
      {pauzeTekst && <p className={pauzeActief ? 'tga-fout' : 'tga-klein'} role='status' aria-live='polite'>{pauzeActief ? `${pauzeTekst.kop}. ${pauzeTekst.uitleg}` : pauzeTekst.vrij}</p>}
      {fout && !pauzeActief && <p className='tga-fout' role='alert'>{fout}</p>}
      <div className='tga-rij'><button type='button' className='tga-knop' onClick={() => klaar(false)}>{tr(lang, 'Скасувати — нічого не змінювати', 'Annuleren — niets wijzigen')}</button></div>
    </div>
  </div>;
}
