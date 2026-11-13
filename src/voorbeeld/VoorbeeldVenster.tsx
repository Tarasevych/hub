// Werkvenster «Попередній перегляд» (audit пошти 18.10.2026): niet alleen een korte blik, maar de volledige inhoud van een
// brief boven de lijst — zonder naar een andere pagina te gaan.
//   - Tekst: volledig, via MailMessageBody (dezelfde sanitizer en hetzelfde beleid voor externe afbeeldingen als de lezer).
//   - Afbeeldingen: galerij van ingesloten afbeeldingen (data uit de brief zelf) en afbeelding-bijlagen.
//   - Bijlagen: lijst met type, naam en grootte; de gekozen bijlage opent hier, met de bestaande viewers
//     (archief → lijst van bestanden en tekstbestanden erin, pdf, docx/xlsx, tekst …). Niets wordt uitgevoerd, alleen bekeken.
//   - Toetsenbord: Esc sluit (het vensterbeheer), ←/→ wisselt tussen bijlagen of afbeeldingen. Smal scherm: volledig scherm.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactElement } from 'react';
import { FileText, Image as ImageIcon, LoaderCircle, Paperclip, ShieldAlert } from 'lucide-react';
import { api } from '../platform/client';
import { Venster } from '../platform/vensters';
import { readMailMessageDetail, writeMailMessageDetail } from '../mail-bijlage-cache';
import { describeMailAttachment, loadMailAttachmentPreview, revokeMailAttachmentPreview, type MailAttachment, type MailAttachmentPreview } from '../MailBijlageVoorbeeld';
import type { MailRenderBody } from '../MailBerichtTekst';
import { maakUittreksel } from '../../shared/mail-uittreksel';
import { grootteTekst as grootte, ingeslotenBeeld, isBeeldBijlage, volgende } from './voorbeeld-hulp';
import './voorbeeld.css';
import '../mail-mobiel-passend.css';

const MailMessageBody = lazy(() => import('../MailBerichtTekst'));
const MailAttachmentPreviewBody = lazy(() => import('../MailBijlageVoorbeeld').then((m) => ({ default: m.MailAttachmentPreviewBody })));

export type VoorbeeldBericht = { id: string; subject: string; from: string; receivedAt: number; snippet?: string };
type Detail = { id: string; subject: string; from: string; receivedAt: number; snippet: string; plainText: string; renderBody?: MailRenderBody; attachments: MailAttachment[] };
type Tab = 'tekst' | 'beelden' | 'bijlagen';

export default function VoorbeeldVenster(p: {
  lang: 'uk' | 'nl'; context: Record<string, string>; accountId: string; cacheAccountId: string; bericht: VoorbeeldBericht; onSluit: () => void;
}) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [fout, setFout] = useState('');
  const [tab, setTab] = useState<Tab>('tekst');
  const [actief, setActief] = useState(0);
  const [voorbeelden, setVoorbeelden] = useState<Record<string, MailAttachmentPreview | 'laden' | 'fout'>>({});
  const eigen = useRef<MailAttachmentPreview[]>([]);

  useEffect(() => {
    let weg = false;
    (async () => {
      try {
        const cache = await readMailMessageDetail<Detail>(p.cacheAccountId, p.bericht.id);
        if (cache && !weg) { setDetail(cache); return; }
        const r = await api.post('/api/owner/mail/google-suite/message', { ...p.context, accountId: p.accountId, messageId: p.bericht.id });
        const d = (r.data as { message?: Detail }).message;
        if (!d) throw new Error('leeg');
        await writeMailMessageDetail(p.cacheAccountId, p.bericht.id, d);
        if (!weg) setDetail(d);
      } catch { if (!weg) setFout(t('Не вдалося завантажити лист. Спробуйте ще раз або відкрийте його звичайним способом.', 'De brief kon niet worden geladen. Probeer opnieuw of open hem gewoon.')); }
    })();
    return () => { weg = true; };
  }, [p.bericht.id, p.accountId]);

  // Eigen voorbeelden (object-URL's) opruimen bij sluiten.
  useEffect(() => () => { for (const v of eigen.current) revokeMailAttachmentPreview(v); eigen.current = []; }, []);

  const bijlagen = useMemo(() => (detail?.attachments || []).filter((a) => a.providerAttachmentId), [detail]);
  const beeldBijlagen = useMemo(() => bijlagen.filter(isBeeldBijlage), [bijlagen]);
  const ingesloten = useMemo(() => (detail?.renderBody?.inlineResources || []).map((r) => ({ naam: r.filename || r.contentId || 'image', url: ingeslotenBeeld(r) })).filter((x) => x.url), [detail]);
  const beelden = ingesloten.length + beeldBijlagen.length;

  const laadVoorbeeld = useCallback(async (a: MailAttachment) => {
    const k = a.providerAttachmentId;
    if (voorbeelden[k]) return;
    setVoorbeelden((v) => ({ ...v, [k]: 'laden' }));
    try {
      const pv = await loadMailAttachmentPreview({ context: p.context, accountId: p.accountId, cacheAccountId: p.cacheAccountId, messageId: p.bericht.id, item: a });
      eigen.current.push(pv);
      setVoorbeelden((v) => ({ ...v, [k]: pv }));
    } catch { setVoorbeelden((v) => ({ ...v, [k]: 'fout' })); }
  }, [voorbeelden, p.context, p.accountId, p.cacheAccountId, p.bericht.id]);

  useEffect(() => { if (tab === 'bijlagen' && bijlagen[actief]) void laadVoorbeeld(bijlagen[actief]); }, [tab, actief, bijlagen]);
  useEffect(() => { if (tab === 'beelden') for (const a of beeldBijlagen.slice(0, 12)) void laadVoorbeeld(a); }, [tab, beeldBijlagen]);

  // ←/→ tussen bijlagen (of afbeeldingen); niet in invoervelden en niet met modifier-toetsen.
  const opToets = (e: ReactKeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (e.altKey || e.ctrlKey || e.metaKey || el.closest('input,textarea,select,[contenteditable="true"]')) return;
    const n = tab === 'bijlagen' ? bijlagen.length : tab === 'beelden' ? beelden : 0;
    if (!n) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); setActief((i) => volgende(i, n, 1)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setActief((i) => volgende(i, n, -1)); }
  };

  const titel = detail?.subject || p.bericht.subject || t('(без теми)', '(geen onderwerp)');
  const tabs: Array<[Tab, string, number, ReactElement]> = [
    ['tekst', t('Текст', 'Tekst'), 0, <FileText key='i' aria-hidden='true' />],
    ['beelden', t('Зображення', 'Afbeeldingen'), beelden, <ImageIcon key='i' aria-hidden='true' />],
    ['bijlagen', t('Вкладення', 'Bijlagen'), bijlagen.length, <Paperclip key='i' aria-hidden='true' />],
  ];
  const huidigBeeld = (() => {
    if (tab !== 'beelden' || !beelden) return null;
    const i = Math.min(actief, beelden - 1);
    if (i < ingesloten.length) return { naam: ingesloten[i].naam, url: ingesloten[i].url };
    const a = beeldBijlagen[i - ingesloten.length]; const v = voorbeelden[a.providerAttachmentId];
    return { naam: a.filename, url: v && typeof v === 'object' ? v.url : '' };
  })();

  return (
    <Venster id={`mail-voorbeeld-${p.bericht.id}`} titel={titel} breedte={980} hoogte={720} onSluit={p.onSluit} className='voorbeeld-venster' lang={p.lang}>
      <div className='voorbeeld-werk' onKeyDown={opToets} data-voorbeeld-venster='true'>
        <header className='voorbeeld-kop'>
          <strong className='voorbeeld-van' title={detail?.from || p.bericht.from}>{(detail?.from || p.bericht.from || '').replace(/\s*<[^>]+>\s*$/, '') || '—'}</strong>
          <time className='voorbeeld-tijd'>{new Date(detail?.receivedAt || p.bericht.receivedAt || Date.now()).toLocaleString(p.lang === 'uk' ? 'uk-UA' : 'nl-BE', { dateStyle: 'medium', timeStyle: 'short' })}</time>
        </header>
        <nav className='voorbeeld-tabs' role='tablist' aria-label={t('Вміст листа', 'Inhoud van de brief')}>
          {tabs.map(([id, naam, n, icoon]) => (
            <button key={id} type='button' role='tab' aria-selected={tab === id} className={tab === id ? 'is-actief' : ''} disabled={id !== 'tekst' && !n}
              onClick={() => { setTab(id); setActief(0); }}>{icoon}<span>{naam}</span>{id !== 'tekst' && <small>{n}</small>}</button>
          ))}
        </nav>
        <div className='voorbeeld-inhoud' role='tabpanel'>
          {fout && <p className='voorbeeld-fout'><ShieldAlert aria-hidden='true' />{fout}</p>}
          {!fout && !detail && <p className='voorbeeld-laden'><LoaderCircle className='spin' aria-hidden='true' />{t('Завантажуємо вміст…', 'Inhoud wordt geladen…')}</p>}
          {detail && tab === 'tekst' && (
            <Suspense fallback={<p className='voorbeeld-laden'><LoaderCircle className='spin' aria-hidden='true' /></p>}>
              {/* SEC-002 (post-05): dit venster staat BUITEN het leesvenster. MailMessageBody volgt hier de bewaarde instelling
                  «Зовнішні зображення» (zonder keuze: vragen) en toont dezelfde strook «N зовнішніх зображень приховано»;
                  `afzender` maakt «Завжди від цього відправника» mogelijk, per account en mailbox. */}
              <MailMessageBody lang={p.lang} context={p.context} accountId={p.accountId} cacheAccountId={p.cacheAccountId} messageId={detail.id} afzender={detail.from || p.bericht.from || ''}
                renderBody={detail.renderBody} fallbackText={detail.plainText || maakUittreksel(detail.snippet) || t('Текст листа відсутній.', 'De berichttekst ontbreekt.')} />
            </Suspense>
          )}
          {detail && tab === 'beelden' && (
            <div className='voorbeeld-galerij'>
              <figure className='voorbeeld-beeld-groot'>
                {huidigBeeld?.url ? <img src={huidigBeeld.url} alt={huidigBeeld.naam} /> : <LoaderCircle className='spin' aria-hidden='true' />}
                <figcaption>{huidigBeeld?.naam} · {Math.min(actief, beelden - 1) + 1}/{beelden}</figcaption>
              </figure>
              <div className='voorbeeld-duimen'>
                {[...ingesloten.map((b) => ({ naam: b.naam, url: b.url })), ...beeldBijlagen.map((a) => { const v = voorbeelden[a.providerAttachmentId]; return { naam: a.filename, url: v && typeof v === 'object' ? v.url : '' }; })].map((b, i) => (
                  <button key={`${b.naam}-${i}`} type='button' className={i === actief ? 'is-actief' : ''} onClick={() => setActief(i)} aria-label={b.naam} title={b.naam}>
                    {b.url ? <img src={b.url} alt='' /> : <ImageIcon aria-hidden='true' />}
                  </button>
                ))}
              </div>
            </div>
          )}
          {detail && tab === 'bijlagen' && (
            <div className='voorbeeld-bijlagen'>
              <ul className='voorbeeld-bijlagenlijst'>
                {bijlagen.map((a, i) => {
                  const d = describeMailAttachment(a);
                  return (
                    <li key={a.providerAttachmentId}>
                      <button type='button' className={i === actief ? 'is-actief' : ''} onClick={() => setActief(i)} title={a.filename}>
                        <span className='voorbeeld-type'>{d?.label || a.contentType.split('/').pop()?.toUpperCase() || '?'}</span>
                        <span className='voorbeeld-naam'>{a.filename || t('без назви', 'zonder naam')}</span>
                        <small>{grootte(a.sizeBytes)}</small>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className='voorbeeld-bijlage-inhoud'>
                {(() => {
                  const a = bijlagen[actief]; if (!a) return null;
                  const v = voorbeelden[a.providerAttachmentId];
                  if (!v || v === 'laden') return <p className='voorbeeld-laden'><LoaderCircle className='spin' aria-hidden='true' />{t('Відкриваємо вкладення…', 'Bijlage wordt geopend…')}</p>;
                  if (v === 'fout') return <p className='voorbeeld-fout'><ShieldAlert aria-hidden='true' />{t('Це вкладення не вдалося показати тут.', 'Deze bijlage kan hier niet worden getoond.')}</p>;
                  return <Suspense fallback={null}><MailAttachmentPreviewBody preview={v} lang={p.lang} context={p.context} accountId={p.accountId} /></Suspense>;
                })()}
              </div>
            </div>
          )}
        </div>
        <footer className='voorbeeld-voet'><small>{t('Esc — закрити · ← → — між вкладеннями й зображеннями · нічого з вкладень не виконується, лише перегляд', 'Esc — sluiten · ← → — tussen bijlagen en afbeeldingen · niets uit bijlagen wordt uitgevoerd, alleen bekeken')}</small></footer>
      </div>
    </Venster>
  );
}
