// «Звідки це?» (pakket 3 «Adaptive Mail Canvas», 24.10.2026) — waar een punt van «Що від вас потрібно?» vandaan komt. Макет: «пункт
// ШІ; цитата оригіналу з виділенням; переклад; «Знайдено дослівно в оригіналі. Дату й термін звірено з текстом листа, а не з
// перекладом»; кнопки «Показати абзац у листі», «Пункт хибний — прибрати»».
// Een blad in het leesvenster (zoals het contextblad): op de telefoon van onderen over de volle breedte, anders rechts boven de brief.
// Escape en «Назад» sluiten eerst dit blad (op de telefoon een eigen stap in de geschiedenis), de focus gaat terug naar de bronchip.
import { Languages, LoaderCircle, Quote, ShieldAlert, ShieldCheck, Sparkles, Trash2, X, Crosshair } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { bronLabel, markeerCitaat, taalVan, type GecontroleerdPunt, type Opbouw } from '../../shared/ai-bronnen';
import { taalLabel } from '../../shared/ai-vertaling';
import { aiFoutVan, aiRun, type AiFout } from './ai-staat';
import { useLeesVenster } from './LeesVenster';
import './ai-blok.css';

export type BronAlineaInfo = { tekst: string; brief: number; nr: number; van: string; wanneer: number };
type Props = {
  lang: 'uk' | 'nl';
  context: Record<string, string>;
  accountId: string;
  berichtId: string;
  punt: GecontroleerdPunt;
  alinea: BronAlineaInfo | null;
  opbouw: Opbouw;
  agentNaam: string;
  /** Id van de privé-agent die mag vertalen, of '' (dan geen vertaalknop — eerlijk gezegd). */
  agentId: string;
  onToon: () => void;
  onWeg: () => void;
  onSluit: () => void;
};

const STAP = 'mrBronBlad';
const stapBoven = () => { try { return Boolean((history.state as Record<string, unknown> | null)?.[STAP]); } catch { return false; } };

export default function BronBlad(p: Props) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const id = useId();
  const lv = useLeesVenster();
  const sluitRef = useRef<HTMLButtonElement | null>(null);
  const [vertaling, setVertaling] = useState<string>('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<AiFout | null>(null);
  const sluitRefFn = useRef(p.onSluit);
  sluitRefFn.current = p.onSluit;
  const eigenStap = useRef(false), zelfTerug = useRef(false);
  const sluit = () => sluitRefFn.current();

  // focus in het blad; bij het sluiten terug naar waar hij was (de bronchip)
  useEffect(() => {
    const vorige = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sluitRef.current?.focus({ preventScroll: true });
    return () => { if (vorige && vorige.isConnected) requestAnimationFrame(() => vorige.focus({ preventScroll: true })); };
  }, []);
  // Escape: eerst dit blad (het kader slaat Escape over zolang [data-bron-blad] er is — src/mail/LeesVenster.tsx ANDERE_LAGEN)
  useEffect(() => {
    const opToets = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; e.preventDefault(); e.stopPropagation(); sluit(); };
    document.addEventListener('keydown', opToets, true);
    return () => document.removeEventListener('keydown', opToets, true);
  }, []);
  // «Назад» op de telefoon: een eigen stap boven die van de brief
  useEffect(() => {
    if (lv?.modus !== 'telefoon') return;
    try { history.pushState({ ...((history.state as object | null) || {}), [STAP]: '1' }, ''); eigenStap.current = true; } catch { /* */ }
    const opTerug = () => { if (zelfTerug.current) { zelfTerug.current = false; return; } if (eigenStap.current && !stapBoven()) { eigenStap.current = false; sluitRefFn.current(); } };
    window.addEventListener('popstate', opTerug);
    return () => { window.removeEventListener('popstate', opTerug); if (eigenStap.current && stapBoven()) { eigenStap.current = false; zelfTerug.current = true; try { history.back(); } catch { /* */ } } };
  }, []);

  const alinea = p.alinea;
  const zelfdeTaal = alinea ? taalVan(alinea.tekst) === p.lang : true;
  const vertaal = async () => {
    if (!alinea || !p.agentId || bezig) return;
    setBezig(true); setFout(null);
    try {
      const r = await aiRun(p.context, { mode: 'translate', targetLang: p.lang, agentId: p.agentId, accountId: p.accountId, messageId: `${p.berichtId}:§${alinea.nr}`, subject: '', bodyText: '', segments: [{ id: 'p', text: alinea.tekst }] });
      setVertaling(String(r.translations?.p || ''));
      if (!r.translations?.p) setFout({ code: 'LEEG', uk: 'Рушій не повернув перекладу цього абзацу. Ми нічого не вигадуємо.', nl: 'De motor gaf geen vertaling van deze alinea. Er wordt niets verzonnen.', href: '/ai' });
    } catch (e) { setFout(aiFoutVan(e)); } finally { setBezig(false); }
  };

  const delen = alinea ? markeerCitaat(alinea.tekst, p.punt.citaat) : [];
  const wie = alinea ? `${alinea.van ? `${alinea.van} · ` : ''}${alinea.wanneer ? new Date(alinea.wanneer).toLocaleString(p.lang === 'uk' ? 'uk-UA' : 'nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}` : '';
  const gevonden = p.punt.status === 'letterlijk';
  const doel = typeof document !== 'undefined' ? document.querySelector('.google-mail-reader') : null;

  const blad = (
    <>
      <div className='bron-blad-scherm' aria-hidden='true' onMouseDown={sluit} />
      <div className='bron-blad' role='dialog' aria-modal='true' aria-labelledby={`${id}-kop`} data-bron-blad data-status={p.punt.status}>
        <header>
          <h2 id={`${id}-kop`}>{t('Звідки це?', 'Waar komt dit vandaan?')}</h2>
          <button ref={sluitRef} type='button' className='bron-blad-sluit' aria-label={t('Закрити', 'Sluiten')} title={t('Закрити', 'Sluiten')} onClick={sluit}><X aria-hidden='true' /></button>
        </header>
        <div className='bron-blad-inhoud'>
          <section className='bron-blad-punt' data-opbouw={p.opbouw} aria-label={t('Пункт', 'Punt')}>
            <span className='ai-blok-merk' data-opbouw={p.opbouw}>{p.opbouw === 'model' ? <><Sparkles aria-hidden='true' />{t('ШІ', 'AI')}</> : t('Авто', 'Auto')}</span>
            <p>{p.punt.tekst}</p>
          </section>
          {alinea ? (
            <section className='bron-blad-origineel' aria-label={t('Оригінал', 'Origineel')}>
              <h3><Quote aria-hidden='true' />{t('Оригінал', 'Origineel')} · {bronLabel(p.lang, alinea)}{wie ? <small> · {wie}</small> : null}</h3>
              <blockquote lang={taalVan(alinea.tekst)} data-bron-alinea>{delen.map((d, i) => (d.mark ? <mark key={i}>{d.tekst}</mark> : <span key={i}>{d.tekst}</span>))}</blockquote>
            </section>
          ) : (
            <p className='bron-blad-geen'>{t('Абзацу з цим текстом у листі немає.', 'Er staat geen alinea met deze tekst in het bericht.')}</p>
          )}
          {alinea && !zelfdeTaal && (
            <section className='bron-blad-vertaling' aria-label={t('Переклад', 'Vertaling')}>
              <h3><Languages aria-hidden='true' />{t('Переклад', 'Vertaling')} · {taalLabel(p.lang, p.lang)}</h3>
              {vertaling
                ? <><p data-bron-vertaling>{vertaling}</p><small>{t('Переклад ШІ — не частина листа. Дати й терміни перевіряйте в оригіналі.', 'Vertaling door AI — geen deel van het bericht. Controleer datums en termijnen in het origineel.')}</small></>
                : p.agentId
                  ? <button type='button' className='ai-blok-knop' onClick={() => void vertaal()} disabled={bezig}>{bezig ? <LoaderCircle className='spin' aria-hidden='true' /> : <Languages aria-hidden='true' />}{t('Перекласти абзац', 'Alinea vertalen')}</button>
                  : <small>{t('Переклад недоступний: ШІ-агента не підключено («Доступ ШІ»). Абзац нікуди не надсилається.', 'Vertalen kan niet: er is geen AI-agent gekoppeld («AI-toegang»). De alinea gaat nergens heen.')}</small>}
              {fout && <p className='ai-blok-fout' role='alert'>{t(fout.uk, fout.nl)}</p>}
            </section>
          )}
          <p className={`bron-blad-controle${gevonden ? '' : ' is-niet'}`} data-controle={p.punt.status}>
            {gevonden ? <ShieldCheck aria-hidden='true' /> : <ShieldAlert aria-hidden='true' />}
            <span>
              {gevonden ? t('Знайдено дослівно в оригіналі.', 'Letterlijk gevonden in het origineel.') : t('Цього не знайдено в листі дослівно — не покладайтеся на цей пункт.', 'Dit staat niet letterlijk in het bericht — vertrouw niet op dit punt.')}
              {gevonden && p.punt.termijnStaat === 'in-bron' ? ` ${t('Дату й термін звірено з текстом листа, а не з перекладом.', 'Datum en termijn zijn nagekeken in de tekst van het bericht, niet in een vertaling.')}` : ''}
              {gevonden && p.punt.termijnStaat === 'niet-in-bron' ? ` ${t('Термін, який назвала модель, у цьому абзаці не знайдено — його не показано.', 'De termijn die het model noemde, staat niet in deze alinea — hij wordt niet getoond.')}` : ''}
              {gevonden && p.punt.verplaatst ? ` ${t('Модель вказала інший абзац; джерело уточнено.', 'Het model noemde een andere alinea; de bron is verbeterd.')}` : ''}
              {p.opbouw === 'eenvoudig' ? ` ${t('Пункт — це речення з листа (простий розбір без моделі).', 'Het punt is een zin uit het bericht (eenvoudige ontleding zonder model).')}` : ''}
            </span>
          </p>
        </div>
        <footer className='bron-blad-knoppen'>
          <button type='button' className='ai-blok-knop' data-bron-toon disabled={!alinea} onClick={p.onToon}><Crosshair aria-hidden='true' />{t('Показати абзац у листі', 'Alinea in het bericht tonen')}</button>
          <button type='button' className='ai-blok-knop ai-blok-knop-weg' data-bron-weg onClick={p.onWeg}><Trash2 aria-hidden='true' />{t('Пункт хибний — прибрати', 'Punt klopt niet — weghalen')}</button>
        </footer>
      </div>
    </>
  );
  return doel ? createPortal(blad, doel) : blad;
}
