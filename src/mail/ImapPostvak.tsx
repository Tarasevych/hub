// MAIL-IMAP-LEZEN-001 (15.11.2026): de inbox van een IMAP-mailbox (Ukr.net, I.ua, iCloud, Yahoo …) in de mailpagina.
// Wens van de eigenaar: kiezen in de wisselaar = de berichten van DIE mailbox zien, zoals het profielmenu van de site wisselt.
// De server leest live (backend/mail-imap-lezen.ts) en bewaart niets; deze weergave toont alleen platte tekst (geen HTML,
// geen externe beelden) — er kan dus geen script of volgpixel uit een bericht meekomen.
// Українською: список і читання листів IMAP-скриньки; лише текст, нічого не зберігається.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Paperclip, RefreshCw } from 'lucide-react';
import { api } from '../platform/client';
import type { ImapBericht, ImapKop } from '../../shared/mail-imap-mime';
import { mailImapFoutTekst } from '../../shared/mail-aanbieders';
import './imap-postvak.css';

type Taal = 'uk' | 'nl';
type Props = { lang: Taal; id: string; dienst: string; context: () => Record<string, unknown>; onManage: () => void };

const PER_PAGINA = 25;

/** Foutcode → zin (bekende IMAP-codes via het gedeelde woordenboek; sleutelkluis apart). */
function foutZin(code: string, lang: Taal): string {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  if (code === 'SLEUTELKLUIS_GESLOTEN') return t('Ваші дані зараз зашифровані. Натисніть «Розшифрувати» в картці вгорі сторінки.', 'Uw gegevens zijn nu versleuteld. Klik op «Ontsleutelen» in de kaart bovenaan de pagina.');
  if (code === 'MAIL_IMAP_TE_GROOT') return t('Лист завеликий для показу тут (понад 2 МБ).', 'Het bericht is te groot om hier te tonen (meer dan 2 MB).');
  return mailImapFoutTekst(code, lang) || `${t('Код сервера:', 'Servercode:')} ${code || 'HTTP'}`;
}

const datumTekst = (ms: number, lang: Taal) => {
  if (!ms) return '';
  const d = new Date(ms), nu = new Date();
  const zelfdeDag = d.toDateString() === nu.toDateString();
  return d.toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', zelfdeDag ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', ...(d.getFullYear() !== nu.getFullYear() ? { year: 'numeric' } : {}) });
};
const initiaal = (k: ImapKop) => ((k.van || k.vanAdres || '?').trim()[0] || '?').toUpperCase();
const codeVan = (e: unknown) => String((e as { response?: { data?: { fout?: string; errorCode?: string } } })?.response?.data?.fout || (e as { response?: { data?: { errorCode?: string } } })?.response?.data?.errorCode || 'NETWORK_ERROR');

export default function ImapPostvak({ lang, id, dienst, context, onManage }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [lijst, setLijst] = useState<ImapKop[]>([]);
  const [totaal, setTotaal] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [bezig, setBezig] = useState(true);
  const [fout, setFout] = useState('');
  const [open, setOpen] = useState<ImapBericht | null>(null);
  const [leest, setLeest] = useState(0);
  const serie = useRef(0);
  // De ouder geeft bij elke render een nieuwe context-functie: via een ref, anders herlaadt de lijst eindeloos.
  const ctx = useRef(context);
  ctx.current = context;

  const laden = useCallback(async (p: number) => {
    const mijn = ++serie.current;
    setBezig(true); setFout('');
    try {
      const r = await api.post('/api/owner/mail/imap/berichten', { ...ctx.current(), id, pagina: p, aantal: PER_PAGINA });
      if (mijn !== serie.current) return;
      const d = r.data as { ok?: boolean; fout?: string; totaal?: number; berichten?: ImapKop[] };
      if (!d.ok) { setFout(foutZin(String(d.fout || ''), lang)); return; }
      setTotaal(Number(d.totaal || 0));
      setLijst((oud) => (p === 0 ? d.berichten || [] : [...oud, ...(d.berichten || [])]));
      setPagina(p);
    } catch (e) {
      if (mijn === serie.current) setFout(foutZin(codeVan(e), lang));
    } finally {
      if (mijn === serie.current) setBezig(false);
    }
  }, [id, lang]);

  useEffect(() => { setLijst([]); setOpen(null); void laden(0); }, [id, laden]);

  const lees = async (k: ImapKop) => {
    setLeest(k.uid); setFout('');
    try {
      const r = await api.post('/api/owner/mail/imap/bericht', { ...ctx.current(), id, uid: k.uid });
      const d = r.data as { ok?: boolean; fout?: string; bericht?: ImapBericht };
      if (!d.ok || !d.bericht) { setFout(foutZin(String(d.fout || ''), lang)); return; }
      setOpen(d.bericht);
      setLijst((oud) => oud.map((x) => (x.uid === k.uid ? { ...x, gelezen: x.gelezen } : x)));
    } catch (e) { setFout(foutZin(codeVan(e), lang)); } finally { setLeest(0); }
  };

  if (open) {
    return (
      <article className='imap-postvak imap-lezer' data-imap-bericht={open.uid} aria-label={open.onderwerp || t('Лист', 'Bericht')}>
        <header>
          <button type='button' className='imap-terug' onClick={() => setOpen(null)} title={t('Повернутися до списку листів цієї скриньки', 'Terug naar de berichtenlijst van deze mailbox')}><ArrowLeft size={18} /><span>{t('До списку', 'Naar de lijst')}</span></button>
          <h2>{open.onderwerp || t('(без теми)', '(geen onderwerp)')}</h2>
          <p><strong>{open.van}</strong>{open.vanAdres && open.vanAdres !== open.van ? <span> &lt;{open.vanAdres}&gt;</span> : null}<time>{datumTekst(open.datum, lang)}</time></p>
        </header>
        {open.bijlagen.length ? <ul className='imap-bijlagen' aria-label={t('Вкладення', 'Bijlagen')}>{open.bijlagen.map((b, i) => <li key={i}><Paperclip size={14} /><span>{b.naam}</span><small>{Math.max(1, Math.round(b.grootte / 1024))} KB</small></li>)}</ul> : null}
        <div className='imap-tekst'>{open.tekst || t('(лист без тексту)', '(bericht zonder tekst)')}</div>
        {open.wasHtml ? <p className='imap-noot'>{t('Показано текст листа без оформлення й зовнішніх зображень — для безпеки.', 'De tekst van het bericht wordt zonder opmaak en externe afbeeldingen getoond — voor de veiligheid.')}</p> : null}
      </article>
    );
  }

  return (
    <section className='imap-postvak' data-imap-postvak={id} aria-label={`${dienst}: ${t('вхідні', 'inbox')}`} aria-busy={bezig}>
      <div className='imap-balk'>
        <span>{dienst} · {t('вхідні', 'inbox')}{totaal ? ` · ${totaal}` : ''}</span>
        <button type='button' onClick={() => void laden(0)} disabled={bezig} title={t('Ще раз отримати найновіші листи з сервісу', 'De nieuwste berichten opnieuw bij de dienst ophalen')} aria-label={t('Оновити', 'Vernieuwen')}><RefreshCw size={16} className={bezig ? 'spin' : ''} /></button>
      </div>
      {fout ? <div className='imap-fout' role='alert'><p>{fout}</p><div><button type='button' onClick={() => void laden(0)}>{t('Спробувати ще раз', 'Opnieuw proberen')}</button><button type='button' onClick={onManage}>{t('Керувати підключенням', 'Koppeling beheren')}</button></div></div> : null}
      {!fout && !bezig && !lijst.length ? <p className='imap-leeg'>{t('У цій скриньці немає листів.', 'Deze mailbox heeft geen berichten.')}</p> : null}
      <ul className='imap-lijst'>
        {lijst.map((k) => (
          <li key={k.uid}>
            <button type='button' className={k.gelezen ? '' : 'ongelezen'} disabled={leest === k.uid} onClick={() => void lees(k)}>
              <span className='imap-avatar' aria-hidden='true'>{initiaal(k)}</span>
              <span className='imap-regel'>
                <span className='imap-kop'><strong>{k.van || k.vanAdres || t('(невідомо)', '(onbekend)')}</strong>{k.bijlage ? <Paperclip size={14} aria-label={t('є вкладення', 'met bijlage')} /> : null}<time>{datumTekst(k.datum, lang)}</time></span>
                <span className='imap-onderwerp'>{k.onderwerp || t('(без теми)', '(geen onderwerp)')}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {bezig && !lijst.length ? <p className='imap-leeg'>{t('Отримуємо листи з', 'Berichten ophalen bij')} {dienst}…</p> : null}
      {lijst.length && lijst.length < totaal ? <button type='button' className='imap-meer' disabled={bezig} onClick={() => void laden(pagina + 1)}>{bezig ? t('Завантаження…', 'Laden…') : t('Показати старіші листи', 'Oudere berichten tonen')}</button> : null}
    </section>
  );
}
