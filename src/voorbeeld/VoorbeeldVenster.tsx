// Werkvenster «Попередній перегляд» (audit пошти 18.10.2026): niet alleen een korte blik, maar de volledige inhoud van een
// brief boven de lijst — zonder naar een andere pagina te gaan.
//   - Tekst: volledig, via MailMessageBody (dezelfde sanitizer en hetzelfde beleid voor externe afbeeldingen als de lezer).
//   - Afbeeldingen: galerij van ingesloten afbeeldingen (data uit de brief zelf) en afbeelding-bijlagen.
//   - Bijlagen: lijst met type, naam en grootte; de gekozen bijlage opent hier, met de bestaande viewers
//     (archief → lijst van bestanden en tekstbestanden erin, pdf, docx/xlsx, tekst …). Niets wordt uitgevoerd, alleen bekeken.
//   - Toetsenbord: Esc sluit (het vensterbeheer), ←/→ wisselt tussen bijlagen of afbeeldingen. Smal scherm: volledig scherm.
//   - SPIL-WEERGAVE / CONSOL-001: achter vlag `bijlage-weergave-gedeeld-v1` verschijnen de gedeelde kop (WeergaveKopLui),
//     de bijlagestrook (WeergaveStrookLui) en de tweetalige actie «Розпізнати текст скану» / «Tekst uit scan herkennen».
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactElement } from 'react';
import { Check, Copy, FileText, Image as ImageIcon, LoaderCircle, Paperclip, ScanText, ShieldAlert } from 'lucide-react';
import { maakUittreksel } from '../../shared/mail-uittreksel';
import type { MailRenderBody } from '../MailBerichtTekst';
import { describeMailAttachment, loadMailAttachmentPreview, revokeMailAttachmentPreview, type MailAttachment, type MailAttachmentPreview } from '../MailBijlageVoorbeeld';
import { kanScanHerkennen, ocrFoutUitleg, vraagBijlageOcrTekst, type BijlageOcrAntwoord } from '../bijlage-weergave/ocr-client';
import { WEERGAVE_VLAG } from '../bijlage-weergave/soort';
import type { ContextActie } from '../bijlage-weergave/Weergave';
import { useVlag } from '../functievlag-lezen';
import { readMailMessageDetail, writeMailMessageDetail } from '../mail-bijlage-cache';
import { api } from '../platform/client';
import { Venster } from '../platform/vensters';
import { grootteTekst as grootte, ingeslotenBeeld, isBeeldBijlage, volgende } from './voorbeeld-hulp';
import './voorbeeld.css';
import '../mail-mobiel-passend.css';

const MailMessageBody = lazy(() => import('../MailBerichtTekst'));
const MailAttachmentPreviewBody = lazy(() => import('../MailBijlageVoorbeeld').then((m) => ({ default: m.MailAttachmentPreviewBody })));
const WeergaveKopLui = lazy(() => import('../bijlage-weergave/Weergave').then((m) => ({ default: m.WeergaveKop })));
const WeergaveStrookLui = lazy(() => import('../bijlage-weergave/Weergave').then((m) => ({ default: m.WeergaveStrook })));

export type VoorbeeldBericht = { id: string; subject: string; from: string; receivedAt: number; snippet?: string };
type Detail = { id: string; subject: string; from: string; receivedAt: number; snippet: string; plainText: string; renderBody?: MailRenderBody; attachments: MailAttachment[] };
type Tab = 'tekst' | 'beelden' | 'bijlagen';

export default function VoorbeeldVenster(p: {
  lang: 'uk' | 'nl'; context: Record<string, string>; accountId: string; cacheAccountId: string; bericht: VoorbeeldBericht; onSluit: () => void;
}) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const gedeeldeWeergave = useVlag(WEERGAVE_VLAG, false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [fout, setFout] = useState('');
  const [tab, setTab] = useState<Tab>('tekst');
  const [actief, setActief] = useState(0);
  const [voorbeelden, setVoorbeelden] = useState<Record<string, MailAttachmentPreview | 'laden' | 'fout'>>({});
  const [ocrStaten, setOcrStaten] = useState<Record<string, 'bezig' | BijlageOcrAntwoord>>({});
  const [gekopieerdId, setGekopieerdId] = useState('');
  const eigen = useRef<MailAttachmentPreview[]>([]);

  useEffect(() => {
    let weg = false;
    setOcrStaten({});
    setGekopieerdId('');
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

  const laadVoorbeeld = useCallback(async (a: MailAttachment, dwing = false) => {
    const k = a.providerAttachmentId;
    if (!dwing && voorbeelden[k]) return;
    setVoorbeelden((v) => ({ ...v, [k]: 'laden' }));
    try {
      const pv = await loadMailAttachmentPreview({ context: p.context, accountId: p.accountId, cacheAccountId: p.cacheAccountId, messageId: p.bericht.id, item: a });
      eigen.current.push(pv);
      setVoorbeelden((v) => ({ ...v, [k]: pv }));
    } catch { setVoorbeelden((v) => ({ ...v, [k]: 'fout' })); }
  }, [voorbeelden, p.context, p.accountId, p.cacheAccountId, p.bericht.id]);

  useEffect(() => { if (tab === 'bijlagen' && bijlagen[actief]) void laadVoorbeeld(bijlagen[actief]); }, [tab, actief, bijlagen]);
  useEffect(() => { if (tab === 'beelden') for (const a of beeldBijlagen.slice(0, 12)) void laadVoorbeeld(a); }, [tab, beeldBijlagen]);

  const startScanHerkenning = useCallback(async (a: MailAttachment) => {
    const k = a.providerAttachmentId;
    if (ocrStaten[k] === 'bezig') return;
    setOcrStaten((s) => ({ ...s, [k]: 'bezig' }));
    setGekopieerdId('');
    const uit = await vraagBijlageOcrTekst({
      bron: 'mail',
      context: p.context,
      accountId: p.accountId,
      messageId: p.bericht.id,
      attachmentId: k,
      filename: a.filename,
      contentType: a.contentType,
    });
    setOcrStaten((s) => ({ ...s, [k]: uit }));
  }, [ocrStaten, p.context, p.accountId, p.bericht.id]);

  const kopieerScanTekst = async (id: string, tekst: string) => {
    if (!tekst) return;
    try {
      await navigator.clipboard?.writeText(tekst);
      setGekopieerdId(id);
    } catch {
      setGekopieerdId('');
    }
  };

  const maakScanActies = (a: MailAttachment): ContextActie[] => (
    kanScanHerkennen(a.filename, a.contentType, a.sizeBytes)
      ? [{
          sleutel: 'ocr-scan',
          label: ['Розпізнати текст скану', 'Tekst uit scan herkennen'],
          icoon: ScanText,
          zichtbaar: true,
          uitvoeren: () => { void startScanHerkenning(a); },
        }]
      : []
  );

  const downloadVoorbeeld = (pv: MailAttachmentPreview, naam: string) => {
    const link = document.createElement('a');
    link.href = pv.url;
    link.download = naam || pv.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const renderOcrBlok = (id: string) => {
    const st = ocrStaten[id];
    if (!gedeeldeWeergave || !st) return null;
    if (st === 'bezig') {
      return (
        <p className='voorbeeld-laden' role='status' aria-busy='true'>
          <LoaderCircle className='spin' aria-hidden='true' />
          {t('Розпізнаємо текст зі скану…', 'Tekst uit scan herkennen…')}
        </p>
      );
    }
    if (st.status === 'ok' && st.tekst) {
      return (
        <section aria-label={t('Розпізнаний текст скану', 'Herkende scantekst')} style={{ display: 'grid', gap: '8px', marginTop: '10px', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--line, var(--rand))' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <strong>{t('Розпізнаний текст скану', 'Herkende scantekst')}</strong>
            <button type='button' className='weergave-context-knop' onClick={() => void kopieerScanTekst(id, st.tekst)}>
              {gekopieerdId === id ? <Check aria-hidden='true' /> : <Copy aria-hidden='true' />}
              <span>{gekopieerdId === id ? t('Скопійовано', 'Gekopieerd') : t('Скопіювати текст', 'Tekst kopiëren')}</span>
            </button>
          </div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '220px', overflow: 'auto' }}>{st.tekst}</pre>
        </section>
      );
    }
    return (
      <p className='voorbeeld-laden' role='status'>
        <ScanText aria-hidden='true' />
        {ocrFoutUitleg(st.status, p.lang)}
      </p>
    );
  };

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
  const actiefBeeldIndex = tab === 'beelden' && beelden ? Math.min(actief, beelden - 1) : -1;
  const actiefBeeldBijlage = actiefBeeldIndex >= ingesloten.length ? beeldBijlagen[actiefBeeldIndex - ingesloten.length] : null;
  const huidigBeeld = (() => {
    if (tab !== 'beelden' || !beelden || actiefBeeldIndex < 0) return null;
    if (actiefBeeldIndex < ingesloten.length) return { naam: ingesloten[actiefBeeldIndex].naam, url: ingesloten[actiefBeeldIndex].url };
    const a = beeldBijlagen[actiefBeeldIndex - ingesloten.length]; const v = voorbeelden[a.providerAttachmentId];
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
              {gedeeldeWeergave && actiefBeeldBijlage ? (() => {
                const pv = voorbeelden[actiefBeeldBijlage.providerAttachmentId];
                const geladenPv = pv && typeof pv === 'object' ? pv : null;
                return (
                  <div data-weergave-drager='post'>
                    <Suspense fallback={null}>
                      <WeergaveKopLui
                        taal={p.lang}
                        bron='post'
                        kopElement='div'
                        zonderSluiten
                        naam={actiefBeeldBijlage.filename}
                        contentType={geladenPv?.contentType || actiefBeeldBijlage.contentType}
                        grootte={Number(geladenPv?.sizeBytes || actiefBeeldBijlage.sizeBytes || 0)}
                        blob={geladenPv?.blob || null}
                        nav={{ index: actiefBeeldIndex, totaal: beelden }}
                        beschikbaar={geladenPv ? { download: () => downloadVoorbeeld(geladenPv, actiefBeeldBijlage.filename) } : {}}
                        contextActies={maakScanActies(actiefBeeldBijlage)}
                        onSluit={p.onSluit}
                      />
                    </Suspense>
                  </div>
                );
              })() : null}
              <figure className='voorbeeld-beeld-groot'>
                {huidigBeeld?.url ? <img src={huidigBeeld.url} alt={huidigBeeld.naam} /> : <LoaderCircle className='spin' aria-hidden='true' />}
                <figcaption>{huidigBeeld?.naam} · {Math.min(actief, beelden - 1) + 1}/{beelden}</figcaption>
              </figure>
              {actiefBeeldBijlage ? renderOcrBlok(actiefBeeldBijlage.providerAttachmentId) : null}
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
                  const geladenPv = v && typeof v === 'object' ? v : null;
                  return (
                    <>
                      {gedeeldeWeergave ? (
                        <div data-weergave-drager='post'>
                          <Suspense fallback={null}>
                            <WeergaveKopLui
                              taal={p.lang}
                              bron='post'
                              kopElement='div'
                              zonderSluiten
                              naam={a.filename || t('без назви', 'zonder naam')}
                              contentType={geladenPv?.contentType || a.contentType}
                              grootte={Number(geladenPv?.sizeBytes || a.sizeBytes || 0)}
                              blob={geladenPv?.blob || null}
                              archiefNamen={geladenPv ? (geladenPv.archiveEntries || []).map((e) => e.name) : undefined}
                              nav={{ index: actief, totaal: bijlagen.length }}
                              beschikbaar={geladenPv ? { download: () => downloadVoorbeeld(geladenPv, a.filename) } : {}}
                              staat={v === 'laden'
                                ? { fase: 'laden', naam: a.filename, code: '', onOpnieuw: () => void laadVoorbeeld(a, true) }
                                : v === 'fout'
                                  ? { fase: 'fout', naam: a.filename, code: 'MAIL_FOUT', onOpnieuw: () => void laadVoorbeeld(a, true) }
                                  : null}
                              contextActies={maakScanActies(a)}
                              onSluit={p.onSluit}
                            />
                          </Suspense>
                        </div>
                      ) : null}
                      {!v || v === 'laden'
                        ? <p className='voorbeeld-laden'><LoaderCircle className='spin' aria-hidden='true' />{t('Відкриваємо вкладення…', 'Bijlage wordt geopend…')}</p>
                        : v === 'fout'
                          ? <p className='voorbeeld-fout'><ShieldAlert aria-hidden='true' />{t('Це вкладення не вдалося показати тут.', 'Deze bijlage kan hier niet worden getoond.')}</p>
                          : <Suspense fallback={null}><MailAttachmentPreviewBody preview={v} lang={p.lang} context={p.context} accountId={p.accountId} /></Suspense>}
                      {renderOcrBlok(a.providerAttachmentId)}
                      {gedeeldeWeergave && bijlagen.length > 1 ? (
                        <div data-weergave-drager='post'>
                          <Suspense fallback={null}>
                            <WeergaveStrookLui
                              taal={p.lang}
                              bron='post'
                              items={bijlagen.map((it) => ({ naam: it.filename, contentType: it.contentType, grootte: Number(it.sizeBytes || 0) }))}
                              index={actief}
                              onKies={setActief}
                            />
                          </Suspense>
                        </div>
                      ) : null}
                    </>
                  );
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
