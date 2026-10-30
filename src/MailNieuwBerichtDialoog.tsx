import { useEffect, useRef, useState } from 'react';
import { adressenGeldig } from './mail-adressen';
import { ChevronUp, ChevronsUpDown, CircleAlert, Cloud, CloudOff, Keyboard, LoaderCircle, Mail, Maximize2, Minimize2, Minus, Paperclip, Send, Server, Trash2, X } from 'lucide-react';
import { bovensteZichtbaar as stapelBoven, stapel as stapelVan, useVensters, vensterBeheer, zIndexVan } from './platform/vensters';
import { focusbaar, focusTerug, focusVerloren, houdTab, SR_ALLEEN } from './platform/toegankelijk';
import './toegankelijk.css';
import { emitCanonicalNotice } from './canoniek-meldingen';
import MailAiToolbar from './MailAiWerkbalk';
import MailDiskKnop from './MailDriveKnop';
import MailScheduleMenu from './MailPlanningMenu';
import { composeErrorText, deleteDraftRemote, getDraftRemote, saveDraftRemote, scheduleRemote, sendRemote, type DraftSync } from './mail-opstel-api';
import './mail-concepten.css';
import MailComposeEditor, { type MailComposeEditorHandle } from './MailOpstelBewerker';
import MailInputTools from './MailInvoerHulpmiddelen';
import { registerZone, queueRecompute } from './zwevend-ontwijking';
import './mail-nieuw-bericht.css';
import { isLeesfout, leesBase64 } from '../shared/bestand-lezen';
import { bestandLeesUitleg, bestandLeesfoutCode } from '../shared/foutuitleg';
import { conceptScope, conceptStatusTekst, heeftInhoud as conceptHeeftInhoud, leesConcept, nieuwConceptId, schrijfConcept, wisConcept, type LokaalConcept } from './mail-concept-lokaal';
import { abonneerWeergave, weergaveAccountNu, weergaveRuimteNu } from './gedeelde-voorkeuren';

type Props = {
  lang: 'uk' | 'nl';
  open: boolean;
  accountId: string;
  context: { service: string; tabContext: string; sourceOrigin: string };
  onClose: () => void;
  onSent: () => void;
  /** Opent het venster opnieuw (vanuit de plashka «Чернетка» rechtsonder). */
  onOpen?: () => void;
};

const handtekening = (v: { to: string; cc: string; bcc: string; subject: string; body: string }) => JSON.stringify([v.to.trim(), v.cc.trim(), v.bcc.trim(), v.subject.trim(), v.body]);
/** De lade van dit tabblad (account|ruimte) — dezelfde als die van het uiterlijk en de vensterlade. */
const scopeNu = () => conceptScope(weergaveAccountNu(), weergaveRuimteNu() === 'technisch' ? 'technisch' : 'prive');
/** Id in de gezamenlijke vensterstapel (src/platform/vensters.tsx). */
export const NIEUW_BERICHT_VENSTER = 'mail-nieuw-bericht';
const smalScherm = () => typeof window !== 'undefined' && window.innerWidth <= 560;

export default function MailNewMessageDialog({ lang, open, accountId, context, onClose, onSent, onOpen }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  // 21.10.2026 (мобільний браузер вивантажив вкладку → текст пропав): локальна копія на цьому пристрої, per account+ruimte
  // (src/mail-concept-lokaal.ts). Bij het monteren komt het concept meteen terug in de velden — niet pas na een effect.
  const scopeRef = useRef('');
  const beginRef = useRef<LokaalConcept | null | undefined>(undefined);
  if (beginRef.current === undefined) { scopeRef.current = scopeNu(); beginRef.current = leesConcept(scopeRef.current); }
  const begin = beginRef.current;
  const [to, setTo] = useState(() => begin?.to ?? '');
  const [cc, setCc] = useState(() => begin?.cc ?? '');
  const [bcc, setBcc] = useState(() => begin?.bcc ?? '');
  // Telefoon: Cc/Bcc standaard dicht (ook als er iets in staat — dan een compacte regel); computer: open als er iets in staat.
  const [showCc, setShowCc] = useState(() => Boolean((begin?.cc || begin?.bcc) && !smalScherm()));
  const [subject, setSubject] = useState(() => begin?.subject ?? '');
  const [body, setBody] = useState(() => begin?.body ?? '');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState('');
  const [draftSync, setDraftSync] = useState<DraftSync>('idle');
  // Statusregel «Збережено локально · на сервері о HH:MM»: lokaal (ja/nee/uit) + laatste bevestiging van de server.
  const [lokaal, setLokaal] = useState<'ja' | 'nee' | 'uit'>(() => (begin ? 'ja' : 'nee'));
  const [serverOp, setServerOp] = useState(() => begin?.serverOp ?? 0);
  const serverOpRef = useRef(begin?.serverOp ?? 0);
  // Vensterstanden (zoals in Windows/Gmail): gemaximaliseerd, «hele tekst» (de editor groeit met de tekst, het venster scrolt)
  // en de invoerhulpen (UA/NL, translit, klavier, handschrift) in- of uitgeklapt. Onthouden in deze browser.
  const leesVlag = (k: string, std: boolean) => { try { const v = localStorage.getItem(k); return v === null ? std : v === '1'; } catch { return std; } };
  const zetVlag = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* geen opslag */ } };
  const [groot, setGroot] = useState(() => leesVlag('mail-nm-groot', false));
  const [heelTekst, setHeelTekst] = useState(() => leesVlag('mail-nm-heel-tekst', false));
  const [hulpen, setHulpen] = useState(() => leesVlag('mail-nm-hulpen', false));
  const [verborgen, setVerborgen] = useState(false);
  // Eén aanvraag-id per verzendpoging: een dubbele klik of een herhaling na een time-out maakt nooit twee berichten (idempotent op de server).
  const requestIdRef = useRef<string>('');
  const newRequestId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const editorRef = useRef<MailComposeEditorHandle | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const resizeStateRef = useRef<{ dir: string; startX: number; startY: number; startW: number; startH: number; startTop: number; startLeft: number } | null>(null);
  const [rect, setRect] = useState<{ width: number; height: number; top: number; left: number } | null>(() => {
    try {
      const raw = localStorage.getItem('mail-new-message-rect');
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  });
  // Stabiele concept-id, onafhankelijk van het (asynchroon geladen) Gmail-account. De eerste keer: die van de lokale kopie;
  // na verzenden/verwijderen (id leeg) een nieuwe.
  const localDraftIdRef = useRef<string>('');
  const eersteIdRef = useRef(true);
  if (!localDraftIdRef.current) {
    localDraftIdRef.current = (eersteIdRef.current && begin?.id) || nieuwConceptId();
    eersteIdRef.current = false;
  }
  const bewaardRef = useRef('');
  const draftFieldsRef = useRef({ to, cc, bcc, subject, body });
  const openRef = useRef(open);
  const verborgenRef = useRef(false);
  // Tijdens het renderen bijwerken (niet in een effect): het wegschrijven in een opruimfunctie ziet zo altijd de nieuwste stand.
  draftFieldsRef.current = { to, cc, bcc, subject, body };
  openRef.current = open;
  verborgenRef.current = verborgen;

  /**
   * De lokale kopie NU wegschrijven (synchroon: ook bij pagehide/visibilitychange, vlak voordat de browser het tabblad bevriest).
   * Regel: met × gesloten én precies deze inhoud door de server bevestigd → geen lokale kopie nodig (het staat in «Чернетки»).
   */
  const lokaalSchrijven = () => {
    const f = draftFieldsRef.current, id = localDraftIdRef.current, scope = scopeRef.current;
    if (!conceptHeeftInhoud(f)) { wisConcept(scope, id); setLokaal('nee'); return; }
    if (!openRef.current && verborgenRef.current && bewaardRef.current === handtekening(f)) { wisConcept(scope, id); setLokaal('nee'); return; }
    setLokaal(schrijfConcept(scope, { id, ...f, open: openRef.current, op: Date.now(), serverOp: serverOpRef.current }) ? 'ja' : 'uit');
  };
  const lokaalSchrijvenRef = useRef(lokaalSchrijven);
  lokaalSchrijvenRef.current = lokaalSchrijven;

  useEffect(() => {
    // Mobiele browsers sturen bij het wegleggen van het tabblad vaak alleen `visibilitychange` (geen pagehide/beforeunload).
    const nu = () => lokaalSchrijvenRef.current();
    const verborgen = () => { if (document.visibilityState === 'hidden') nu(); };
    window.addEventListener('pagehide', nu);
    window.addEventListener('beforeunload', nu);
    document.addEventListener('visibilitychange', verborgen);
    document.addEventListener('freeze', nu);
    return () => {
      window.removeEventListener('pagehide', nu);
      window.removeEventListener('beforeunload', nu);
      document.removeEventListener('visibilitychange', verborgen);
      document.removeEventListener('freeze', nu);
    };
  }, []);

  useEffect(() => {
    // While the compose window is open (and while it is being dragged/resized),
    // register it as a fixed obstacle so the floating compose-launch button can
    // step out of the way of its Close/Send controls instead of covering them.
    if (!open) return;
    const unregister = registerZone({
      id: 'mail-new-message-dialog',
      priority: 100,
      kind: 'float',
      getRect: () => dialogRef.current?.getBoundingClientRect() || null,
      fallbacks: [],
    });
    queueRecompute();
    return unregister;
  }, [open]);

  useEffect(() => {
    if (!open || !rect) return;
    const margin = 8;
    const maxW = window.innerWidth - margin * 2;
    const maxH = window.innerHeight - margin * 2;
    let { width, height, top, left } = rect;
    let changed = false;
    if (width > maxW) { width = maxW; changed = true; }
    if (height > maxH) { height = maxH; changed = true; }
    if (left + width > window.innerWidth - margin) { left = Math.max(margin, window.innerWidth - width - margin); changed = true; }
    if (top + height > window.innerHeight - margin) { top = Math.max(margin, window.innerHeight - height - margin); changed = true; }
    if (left < margin) { left = margin; changed = true; }
    if (top < margin) { top = margin; changed = true; }
    if (changed) setRect({ width, height, top, left });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Een ander venster van de stapel staat bovenaan: Esc is van dat venster, niet van de brief.
      if (stapelBoven(vensterBeheer.lijst())?.id !== NIEUW_BERICHT_VENSTER) return;
      // Anything that opened on top of the compose window owns Escape first.
      if (document.querySelector('.canonical-notification-panel, .mail-compose-floating-formatting, .mail-compose-dropdown-menu, .mail-compose-more-menu, .mail-reader-organize-backdrop, .mail-reader-n09-backdrop, .mail-reader-n10-backdrop')) return;
      event.preventDefault();
      close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const startResize = (dir: string) => (event: { preventDefault: () => void; clientX: number; clientY: number }) => {
    event.preventDefault();
    const node = dialogRef.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    resizeStateRef.current = { dir, startX: event.clientX, startY: event.clientY, startW: box.width, startH: box.height, startTop: box.top, startLeft: box.left };
    const move = (moveEvent: globalThis.MouseEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;
      const dx = moveEvent.clientX - state.startX;
      const dy = moveEvent.clientY - state.startY;
      const margin = 8;
      let width = state.startW;
      let left = state.startLeft;
      let height = state.startH;
      let top = state.startTop;
      // Each handle drags its own edge; the opposite edge stays put, the way a real window resizes.
      // Growth simply stops at the screen edge instead of dragging the opposite corner along with it.
      if (state.dir.includes('e')) {
        width = Math.min(1200, Math.max(380, state.startW + dx));
        const maxW = window.innerWidth - left - margin;
        if (width > maxW) width = Math.max(380, maxW);
      }
      if (state.dir.includes('w')) {
        let rawWidth = Math.min(1200, Math.max(380, state.startW - dx));
        let newLeft = state.startLeft + (state.startW - rawWidth);
        if (newLeft < margin) {
          newLeft = margin;
          rawWidth = Math.max(380, state.startLeft + state.startW - margin);
        }
        width = rawWidth;
        left = newLeft;
      }
      if (state.dir.includes('s')) {
        height = Math.min(980, Math.max(320, state.startH + dy));
        const maxH = window.innerHeight - top - margin;
        if (height > maxH) height = Math.max(320, maxH);
      }
      if (state.dir.includes('n')) {
        let rawHeight = Math.min(980, Math.max(320, state.startH - dy));
        let newTop = state.startTop + (state.startH - rawHeight);
        if (newTop < margin) {
          newTop = margin;
          rawHeight = Math.max(320, state.startTop + state.startH - margin);
        }
        height = rawHeight;
        top = newTop;
      }
      setRect({ width, height, top, left });
      queueRecompute();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('pointermove', move as unknown as EventListener);
      window.removeEventListener('pointerup', up);
      resizeStateRef.current = null;
      setRect(current => {
        if (current) {
          try {
            localStorage.setItem('mail-new-message-rect', JSON.stringify(current));
          } catch {}
        }
        return current;
      });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('pointermove', move as unknown as EventListener);
    window.addEventListener('pointerup', up);
  };

  // Stond het venster open toen de pagina wegging (tabblad door de browser weggegooid, herladen)? Dan meteen weer open, met
  // dezelfde tekst — als «terughalen» (herstel), niet als een nieuw bericht.
  useEffect(() => {
    if (begin?.open && conceptHeeftInhoud(begin) && onOpen) { herstelRef.current = true; onOpen(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Ander account of andere ruimte in dit tabblad: het concept van de vorige lade blijft daar (net weggeschreven) en dit venster
  // toont dat van de nieuwe lade. Van «anon» naar een echt account = dezelfde mens die net aanmeldde: het concept gaat mee.
  useEffect(() => abonneerWeergave(() => {
    const nieuw = scopeNu(), oud = scopeRef.current;
    if (nieuw === oud) return;
    if (oud.startsWith('anon|')) { scopeRef.current = nieuw; lokaalSchrijvenRef.current(); return; }
    lokaalSchrijvenRef.current();
    scopeRef.current = nieuw;
    const c = leesConcept(nieuw);
    serverSaveSeq.current++;
    localDraftIdRef.current = c?.id || nieuwConceptId();
    serverOpRef.current = c?.serverOp ?? 0; setServerOp(serverOpRef.current);
    bewaardRef.current = '';
    setTo(c?.to ?? ''); setCc(c?.cc ?? ''); setBcc(c?.bcc ?? ''); setShowCc(Boolean((c?.cc || c?.bcc) && !smalScherm())); setSubject(c?.subject ?? ''); setBody(c?.body ?? '');
    setDraftSync('idle'); setLokaal(c ? 'ja' : 'nee');
  }), []);

  // Lokaal: 300 ms na de laatste wijziging (en bij open/dicht), plus meteen bij het verlaten van de pagina (hierboven).
  useEffect(() => {
    const timer = window.setTimeout(() => lokaalSchrijvenRef.current(), 300);
    return () => {
      window.clearTimeout(timer);
      // Wegschrijven i.p.v. weggooien: deze closure is de laatste stand vóór de volgende toets.
      lokaalSchrijvenRef.current();
    };
  }, [to, cc, bcc, subject, body, open, verborgen]);

  // Concept eerst in PostgreSQL (de server bewaart het meteen), daarna door de server naar Gmail gesynchroniseerd. 700 ms na de
  // laatste toets. Mislukt het (offline, server weg), dan opnieuw na 5 s, 10 s, 20 s … (max 60 s) en meteen bij `online`.
  const serverSaveSeq = useRef(0);
  const [poging, setPoging] = useState(0);
  const foutTeller = useRef(0);
  useEffect(() => {
    if (!open) return;
    if (!conceptHeeftInhoud({ to, cc, bcc, subject, body })) return;
    const sig = handtekening({ to, cc, bcc, subject, body });
    if (bewaardRef.current === sig) return; // al precies zo op de server
    const seq = ++serverSaveSeq.current;
    setDraftSync('saving');
    let opnieuw = 0;
    const timer = window.setTimeout(async () => {
      const plainText = editorRef.current?.getPlainText() ?? '';
      try {
        const out = await saveDraftRemote(context, { to, cc, bcc, subject, html: body, plainText, accountId, localId: localDraftIdRef.current });
        if (seq !== serverSaveSeq.current) return;
        foutTeller.current = 0;
        // 'synced' = ook in Gmail; 'local' = op onze server, Gmail nog niet (bijv. geen Gmail-account of Gmail-fout).
        setDraftSync(out?.draft?.syncStatus === 'synced' ? 'synced' : 'local');
        bewaardRef.current = sig;
        serverOpRef.current = Date.now(); setServerOp(serverOpRef.current);
        lokaalSchrijvenRef.current();
      } catch {
        // De lokale kopie op dit apparaat blijft (lokaalSchrijven); straks opnieuw.
        if (seq !== serverSaveSeq.current) return;
        setDraftSync('error');
        const wacht = Math.min(60_000, 5000 * 2 ** Math.min(4, foutTeller.current++));
        opnieuw = window.setTimeout(() => setPoging((n) => n + 1), wacht);
      }
    }, 700);
    const online = () => setPoging((n) => n + 1);
    window.addEventListener('online', online);
    return () => { window.clearTimeout(timer); window.clearTimeout(opnieuw); window.removeEventListener('online', online); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, cc, bcc, subject, body, accountId, open, poging]);

  // Чернетку відкривають явно (з «Чернеток» чи іншого місця): window 'mail:open-concept' {localId}. «Написати лист» сам чернеток не підтягує (1.6).
  // 26.10 (7.1): Gmail-чернетка з уже завантаженим текстом приходить як detail.gmail і відкривається тут, не в читачі.
  useEffect(() => {
    const opener = (e: Event) => {
      const detail = (e as CustomEvent<{ localId?: string; gmail?: { to?: string; cc?: string; subject?: string; html?: string; plain?: string } }>).detail;
      const gmail = detail?.gmail;
      if (gmail) {
        const html = gmail.html || (gmail.plain ? '<p>' + gmail.plain.split('&').join('&amp;').split('<').join('&lt;').split('\n').join('<br>') + '</p>' : '');
        localDraftIdRef.current = nieuwConceptId();
        serverSaveSeq.current++;
        bewaardRef.current = '';
        setTo(gmail.to || ''); setCc(gmail.cc || ''); setBcc(''); setShowCc(Boolean(gmail.cc)); setSubject(gmail.subject || ''); setBody(html);
        herstelRef.current = true; setVerborgen(false); onOpen?.();
        return;
      }
      const id = String(detail?.localId || '');
      if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) return;
      void getDraftRemote(context, id).then((out) => {
        const d = out?.draft; if (!d) return;
        localDraftIdRef.current = id;
        serverSaveSeq.current++;
        // Precies zo staat het al op de server: niet meteen opnieuw bewaren; de statusregel toont wanneer.
        bewaardRef.current = handtekening({ to: d.to || '', cc: d.cc || '', bcc: d.bcc || '', subject: d.subject || '', body: d.html || '' });
        serverOpRef.current = Number((d as { updatedAt?: number }).updatedAt) || Date.now(); setServerOp(serverOpRef.current); setDraftSync(d.syncStatus === 'synced' ? 'synced' : 'local');
        setTo(d.to || ''); setCc(d.cc || ''); setBcc(d.bcc || ''); setShowCc(Boolean((d.cc || d.bcc) && !smalScherm())); setSubject(d.subject || ''); setBody(d.html || '');
        herstelRef.current = true; setVerborgen(false); onOpen?.();
      }).catch(() => undefined);
    };
    window.addEventListener('mail:open-concept', opener);
    return () => window.removeEventListener('mail:open-concept', opener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const heeftInhoud = Boolean(to.trim() || cc.trim() || bcc.trim() || subject.trim() || body.replace(/<[^>]*>/g, '').trim());
  // «Написати лист» = завжди чистий лист (1.6). Відкрили не зі стопки «Згорнуті», а в редакторі лишився попередній текст? Тоді
  // попередній лист уже збережено як чернетку (сервер + Gmail) — відокремлюємо його й починаємо новий з новим id.
  // 2.7: перехід в інший розділ (посилання поза вікном, «назад») — порожнє вікно закривається, з текстом іде в «Згорнуті» й «Чернетки».
  useEffect(() => {
    if (!open) return;
    const weg = () => onClose();
    const klik = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || dialogRef.current?.contains(el)) return;
      // het gezamenlijke vensterdok en andere vensters zijn geen «navigatie weg»: wisselen tussen vensters laat de brief open
      if (el.closest('.venster-dok, .venster[data-venster]')) return;
      if (el.closest('a[href], [data-nav-item], nav button, .mail-sidebar-navigation button')) weg();
    };
    document.addEventListener('click', klik, true);
    window.addEventListener('popstate', weg);
    return () => { document.removeEventListener('click', klik, true); window.removeEventListener('popstate', weg); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // 4.1: відкрита екранна клавіатура телефона — вікно займає лише видиму частину, шапка й нижній рядок компактні
  const [klavier, setKlavier] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!open || !vv) return;
    const meet = () => { const verschil = window.innerHeight - vv.height; setKlavier(verschil > 140 ? Math.round(vv.height) : 0); };
    meet(); vv.addEventListener('resize', meet);
    return () => vv.removeEventListener('resize', meet);
  }, [open]);
  // Вкладення нового листа (надсилаються разом із листом; у чернетці Gmail їх немає)
  const [bijlagen, setBijlagen] = useState<Array<{ id: string; filename: string; contentType: string; data: string; bytes: number }>>([]);
  const bestandRef = useRef<HTMLInputElement | null>(null);
  // Lezen van de schijf gaat door shared/bestand-lezen.ts: `r.error` is een DOMException (NotReadableError…) die rauw naar
  // buiten vloog — de bijlage verdween dan zonder uitleg. Eigenaar 20.10.2026.
  const naarB64 = (blob: Blob) => leesBase64(blob);
  const voegBijlagenToe = async (items: Array<{ blob: Blob; filename: string; contentType?: string }>) => {
    const nieuw = [] as typeof bijlagen;
    for (const it of items) {
      let data: string;
      try { data = await naarB64(it.blob); }
      catch (e) {
        if (!isLeesfout(e)) throw e;
        const u = bestandLeesUitleg(lang, bestandLeesfoutCode(e));
        setFailure(`${t(`Файл «${it.filename}» не додано: браузер не зміг прочитати його з диска.`, `Bestand «${it.filename}» is niet toegevoegd: de browser kon het niet van de schijf lezen.`)} ${u.waarom} ${u.doen}`);
        continue;
      }
      nieuw.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, filename: it.filename, contentType: it.contentType || it.blob.type || 'application/octet-stream', data, bytes: it.blob.size });
    }
    if (!nieuw.length) return;
    setBijlagen((oud) => { const alles = [...oud, ...nieuw]; const totaal = alles.reduce((n, b) => n + b.bytes, 0); if (totaal > 8 * 1024 * 1024) { setFailure(t('Вкладення разом більші за 8 МБ — додайте посилання на файл у хмарі.', 'Bijlagen samen groter dan 8 MB — voeg een link naar het bestand in de cloud toe.')); return oud; } return alles; });
  };
  // «Переслати саме це вкладення» (3.2): новий чистий лист із цим файлом
  useEffect(() => {
    const op = (e: Event) => {
      const d = (e as CustomEvent<{ blob?: Blob; filename?: string; contentType?: string; subject?: string }>).detail;
      if (!d?.blob) return;
      herstelRef.current = true;
      setTo(''); setCc(''); setBcc(''); setShowCc(false); setBody(''); setSubject(d.subject ? `Fwd: ${d.subject}` : `Fwd: ${d.filename || ''}`); setBijlagen([]);
      localDraftIdRef.current = '';
      void voegBijlagenToe([{ blob: d.blob, filename: d.filename || 'bijlage', contentType: d.contentType }]);
      setVerborgen(false); onOpen?.();
    };
    window.addEventListener('mail:compose-with-attachment', op);
    return () => window.removeEventListener('mail:compose-with-attachment', op);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const herstelRef = useRef(false);
  const [wisVraag, setWisVraag] = useState(false);
  const [kopOpen, setKopOpen] = useState(true);
  const [aanVerlaten, setAanVerlaten] = useState(false);
  // QA 12.10 №4: ook de allereerste opening telt als «nieuw openen» — anders verscheen de oude lokale tekst in «Написати лист».
  const vorigOpen = useRef(false);
  useEffect(() => {
    const was = vorigOpen.current; vorigOpen.current = open;
    if (!open || was) return;
    // QA 12.10 №3: кожне відкриття починається з розгорнутої шапки — інакше перший символ у «Кому» згортав її й решта тексту губилася.
    setKopOpen(true);
    const herstel = herstelRef.current; herstelRef.current = false;
    if (herstel || !heeftInhoud) return;
    const oudId = localDraftIdRef.current;
    const oud = { to, cc, bcc, subject, body };
    // Вже збережено на сервері саме в такому вигляді? Тоді не зберігати вдруге (інакше в «Чернетках» з'являлися дублікати).
    // Не вдалося зберегти попередній лист на сервері (офлайн)? Тоді він не зникає мовчки: сповіщення з «Відновити».
    if (bewaardRef.current !== handtekening(oud)) void saveDraftRemote(context, { to, cc, bcc, subject, html: body, plainText: editorRef.current?.getPlainText() ?? '', accountId, localId: oudId }).catch(() => {
      emitCanonicalNotice({ text: t('Попередню чернетку не вдалося зберегти на сервері', 'Het vorige concept kon niet op de server worden bewaard'), kind: 'warning', source: 'mail', retain: true,
        action: { label: t('Відновити', 'Herstellen'), onAction: () => { herstelRef.current = true; localDraftIdRef.current = oudId; setTo(oud.to); setCc(oud.cc); setBcc(oud.bcc); setSubject(oud.subject); setBody(oud.body); bewaardRef.current = ''; setVerborgen(false); onOpen?.(); } } });
    });
    wisConcept(scopeRef.current, oudId);
    localDraftIdRef.current = '';
    serverSaveSeq.current++;
    serverOpRef.current = 0; setServerOp(0); setLokaal('nee'); bewaardRef.current = '';
    setTo(''); setCc(''); setBcc(''); setShowCc(false); setSubject(''); setBody(''); setFailure(''); setDraftSync('idle'); setVerborgen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // 21.10.2026 (злитий стенд): het venster «Новий лист» doet mee in DE stapel van alle vensters (src/platform/vensters.tsx).
  // Voorheen had het een eigen z-index 1200 en lag een open venster van de gezamenlijke laag (koppelen, «Перевірка всіх адрес»,
  // VENSTER_BASIS + …) eroverheen — ook over het menu «⋯». Nu: open = ingeschreven en bij openen/klikken bovenaan (naarVoren);
  // geminimaliseerd = in hetzelfde dok rechtsonder als de andere vensters (geen eigen plashka of aparte stapel meer);
  // × of verzonden = uitgeschreven. Niet modaal voor de anderen: een venster eronder blijft met één klik bereikbaar.
  const vensters = useVensters();
  const ikVenster = vensters.find((v) => v.id === NIEUW_BERICHT_VENSTER);
  const wasOpenVoorStapel = useRef(false);
  useEffect(() => {
    const titel = subject.trim() || t('Новий лист', 'Nieuw bericht');
    const was = wasOpenVoorStapel.current; wasOpenVoorStapel.current = open;
    if (open) {
      vensterBeheer.registreer(NIEUW_BERICHT_VENSTER, { titel, modaal: false });
      if (!was) vensterBeheer.naarVoren(NIEUW_BERICHT_VENSTER);
      return;
    }
    if (heeftInhoud && onOpen && !verborgen) {
      vensterBeheer.registreer(NIEUW_BERICHT_VENSTER, { titel, modaal: false });
      if (!vensterBeheer.lijst().find((v) => v.id === NIEUW_BERICHT_VENSTER)?.klein) vensterBeheer.minimaliseer(NIEUW_BERICHT_VENSTER);
    } else vensterBeheer.afmelden(NIEUW_BERICHT_VENSTER);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, heeftInhoud, subject, verborgen]);
  useEffect(() => () => vensterBeheer.afmelden(NIEUW_BERICHT_VENSTER), []);
  // Klik in het dok (of Alt+Shift+W) haalt het geminimaliseerde venster naar voren → open als HERSTEL (dezelfde tekst).
  // Levende stand lezen (niet de momentopname van deze render): het minimaliseren hierboven gebeurde in dezelfde commit.
  useEffect(() => {
    const nu = vensterBeheer.lijst().find((v) => v.id === NIEUW_BERICHT_VENSTER);
    if (open || !nu || nu.klein || !onOpen) return;
    herstelRef.current = true; setVerborgen(false); onOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ikVenster?.klein, open]);
  // Concept weggooien vanaf de plashka: lokaal, op de server en in Gmail; volgende brief krijgt een nieuw concept-id.
  const gooiWeg = () => {
    const id = localDraftIdRef.current;
    wisConcept(scopeRef.current, id);
    localDraftIdRef.current = '';
    serverSaveSeq.current++;
    serverOpRef.current = 0; setServerOp(0); setLokaal('nee'); bewaardRef.current = '';
    void deleteDraftRemote(context, id).catch(() => undefined);
    setTo(''); setCc(''); setBcc(''); setShowCc(false); setSubject(''); setBody(''); setFailure(''); setDraftSync('idle');
  };
  // ---- Toegankelijkheid (recensie 21.10.2026; WCAG 2.1.2, 2.4.3, 2.4.11, 4.1.2, 4.1.3) ------------------------------------
  // Stapel: bovenaan = aria-modal en Tab blijft in de brief (de achtergrond bedekt de pagina); onder een MODAAL venster = inert
  // (zoals Venster, regel 4 van platform/vensters.tsx); weer bovenaan (naarVoren: klik, dok, Alt+Shift+W) = de focus komt terug in
  // de brief op het laatst gebruikte veld. Dicht (_ × Esc verzonden) = focus terug naar wie de brief opende (FAB, «Написати» …).
  const stapelNu = stapelVan(vensters);
  const ikRang = stapelNu.findIndex((v) => v.id === NIEUW_BERICHT_VENSTER);
  const ikBoven = stapelBoven(vensters)?.id === NIEUW_BERICHT_VENSTER;
  const bedekt = ikRang >= 0 && stapelNu.slice(ikRang + 1).some((v) => v.modaal && !v.klein);
  const openerRef = useRef<HTMLElement | null>(null);
  const laatsteFocusRef = useRef<HTMLElement | null>(null);
  const openVoorFocus = useRef(false);
  if (open !== openVoorFocus.current) {
    // Tijdens het renderen (vóór autoFocus in de commit): wie had de focus toen de brief openging?
    if (open && typeof document !== 'undefined') { const a = document.activeElement as HTMLElement | null; openerRef.current = a && a !== document.body ? a : null; }
    openVoorFocus.current = open;
  }
  useEffect(() => {
    if (!open) return;
    return () => { if (focusVerloren() && !focusTerug(openerRef.current)) focusTerug(document.querySelector<HTMLElement>('[data-mail-compose-float]')); };
  }, [open]);
  useEffect(() => {
    if (!open || !ikBoven || bedekt) return;
    const r = requestAnimationFrame(() => {
      const d = dialogRef.current, a = document.activeElement;
      if (!d || d.contains(a) || a?.closest('.mail-compose-zwevend, .mail-compose-link-editor, .mail-compose-floating-formatting')) return;
      const laatste = laatsteFocusRef.current;
      if (laatste && d.contains(laatste) && focusTerug(laatste)) return;
      if (!to.trim()) d.querySelector<HTMLElement>('#mail-nm-aan')?.focus();
      else editorRef.current?.focus();
      if (!d.contains(document.activeElement)) d.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ikBoven, bedekt]);
  // Cc/Bcc en de korte kopregel verdwijnen bij het klikken (andere knop in de plaats): de focus gaat naar wat er nu staat.
  const ccFocusRef = useRef<'' | 'veld' | 'knop'>('');
  useEffect(() => {
    const doel = ccFocusRef.current; ccFocusRef.current = '';
    const d = dialogRef.current;
    if (!doel || !d) return;
    (doel === 'veld' ? d.querySelector<HTMLElement>('[data-nm-cc-velden] input') : d.querySelector<HTMLElement>('[data-nm-kopie], [data-nm-cc-kort]'))?.focus();
  }, [showCc]);
  const [kopNaar, setKopNaar] = useState<'' | 'aan' | 'onderwerp'>('');
  useEffect(() => {
    if (!kopNaar || !kopOpen) return;
    const d = dialogRef.current;
    const el = d?.querySelector<HTMLElement>(kopNaar === 'aan' ? '#mail-nm-aan' : '[data-nm-onderwerp]');
    if (el) { el.focus(); setKopNaar(''); }
  }, [kopNaar, kopOpen]);
  // Vraag «Видалити чернетку?»: focus op de veilige keuze («Скасувати»); weer dicht → terug naar «Видалити» (of «Кому»).
  const wisWasRef = useRef(false);
  useEffect(() => {
    const was = wisWasRef.current; wisWasRef.current = wisVraag;
    const d = dialogRef.current;
    if (!d) return;
    if (wisVraag) d.querySelector<HTMLElement>('[data-nm-wis-annuleer]')?.focus();
    else if (was && focusVerloren()) (d.querySelector<HTMLElement>('[data-nm-wis]') || d.querySelector<HTMLElement>('#mail-nm-aan') || d).focus();
  }, [wisVraag]);
  // Concept-indicator: de zichtbare regel is GEEN live-regio meer (role=status is atomair: elke pictogramwissel bij elke typpauze
  // las de hele regel opnieuw voor). Alleen een mislukking en het herstel daarna worden gemeld.
  const [conceptMelding, setConceptMelding] = useState('');
  const vorigeSync = useRef<DraftSync>('idle');
  useEffect(() => {
    const v = vorigeSync.current; vorigeSync.current = draftSync;
    if (draftSync === 'error' && v !== 'error') setConceptMelding(t('Чернетку не вдалося зберегти на сервері — копія лишилася на цьому пристрої, повторимо.', 'Het concept kon niet op de server worden bewaard — de kopie staat op dit apparaat, we proberen het opnieuw.'));
    else if (v === 'error' && (draftSync === 'local' || draftSync === 'synced')) setConceptMelding(t('Чернетку знову збережено на сервері.', 'Het concept is weer op de server bewaard.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftSync]);
  // Ingeklapt: de brief verdwijnt niet — hij staat in het gezamenlijke dok van de vensters (hierboven) en in «Чернетки».
  if (!open) return null;

  const reset = () => {
    setKopOpen(true);
    bewaardRef.current = '';
    setTo('');
    setCc('');
    setBcc('');
    setShowCc(false);
    setSubject('');
    setBody('');
    setFailure('');
  };

  // _ = згорнути (лишається у стопці «Згорнуті» та в «Чернетках»); × = закрити (чернетка лишається в «Чернетках», без плашки).
  // Нічого з написаного не зникає: лише успішне надсилання очищає чернетку.
  const close = () => { setVerborgen(false); onClose(); };
  const sluitHelemaal = () => {
    if (heeftInhoud) emitCanonicalNotice({ text: t('Чернетку збережено в «Чернетках»', 'Concept bewaard in «Concepten»'), kind: 'success', source: 'mail',
      action: { label: t('Відкрити знову', 'Opnieuw openen'), onAction: () => { herstelRef.current = true; setVerborgen(false); onOpen?.(); } }, actionExpiresAt: Date.now() + 30000 });
    setVerborgen(true); onClose();
  };
  const verwijderConcept = () => { gooiWeg(); setWisVraag(false); emitCanonicalNotice({ text: t('Чернетку видалено', 'Concept verwijderd'), kind: 'info', source: 'mail' }); onClose();
  };

  // Na een geslaagde verzending of planning: lokaal alles opruimen en een NIEUW concept-id kiezen voor het volgende bericht.
  const finishCompose = () => {
    const finishedId = localDraftIdRef.current;
    wisConcept(scopeRef.current, finishedId);
    localDraftIdRef.current = '';
    serverOpRef.current = 0; setServerOp(0); setLokaal('nee');
    void deleteDraftRemote(context, finishedId).catch(() => undefined);
    requestIdRef.current = '';
    serverSaveSeq.current++;
    setDraftSync('idle');
    reset();
    setBijlagen([]);
    onSent();
    onClose();
  };
  const payload = () => ({ to, cc, bcc, subject, html: body, plainText: editorRef.current?.getPlainText().trim() || '', accountId, localId: localDraftIdRef.current, ...(bijlagen.length ? { attachments: bijlagen.map(({ filename, contentType, data }) => ({ filename, contentType, data })) } : {}) });

  const send = async () => {
    const plainText = editorRef.current?.getPlainText().trim() || '';
    if (!accountId || sending || !adressenGeldig(to) || !plainText) return;
    setSending(true);
    setFailure('');
    if (!requestIdRef.current) requestIdRef.current = newRequestId();
    try {
      // De server verstuurt de HTML-versie én een platte-tekstversie via de Gmail API (users.messages.send).
      const out = await sendRemote(context, payload(), requestIdRef.current);
      if (out?.item?.status === 'sent') {
        emitCanonicalNotice({ text: t('Лист надіслано', 'Bericht verzonden'), kind: 'success', source: 'mail' });
        finishCompose();
      } else {
        setFailure(t('Лист зараз не вдалося надіслати. Текст залишився у редакторі, спробуйте ще раз.', 'Het bericht kon nu niet worden verzonden. De tekst blijft in de editor staan, probeer het opnieuw.'));
      }
    } catch (error) {
      setFailure(composeErrorText(error, t));
    }
    setSending(false);
  };

  const scheduleSend = async (at: number) => {
    const plainText = editorRef.current?.getPlainText().trim() || '';
    if (!accountId || sending || !to.trim() || !plainText) throw new Error('MAIL_RECIPIENT_REQUIRED');
    setSending(true);
    setFailure('');
    try {
      if (!requestIdRef.current) requestIdRef.current = newRequestId();
      await scheduleRemote(context, payload(), at, requestIdRef.current);
      emitCanonicalNotice({ text: t(`Лист заплановано на ${new Date(at).toLocaleString('uk-UA')}`, `Bericht gepland op ${new Date(at).toLocaleString('nl-BE')}`), kind: 'success', source: 'mail' });
      finishCompose();
    } finally {
      setSending(false);
    }
  };

  return (
    // Laag uit de stapel; een klik op de achtergrond boven een ánder venster haalt dát venster naar voren (en laat de brief open),
    // alleen een klik op de lege pagina minimaliseert de brief zoals voorheen.
    <div className="mail-new-message-backdrop" data-venster={NIEUW_BERICHT_VENSTER} style={{ zIndex: zIndexVan(NIEUW_BERICHT_VENSTER) }}
      onClick={(event) => {
        const eronder = document.elementsFromPoint(event.clientX, event.clientY).find((el) => el !== event.currentTarget && !event.currentTarget.contains(el) && el.closest('.venster[data-venster]'));
        const id = eronder?.closest<HTMLElement>('.venster[data-venster]')?.dataset.venster;
        if (id) { vensterBeheer.naarVoren(id); return; }
        close();
      }}>
      <section
        className={`mail-new-message${groot ? ' groot' : ''}${heelTekst ? ' heel-tekst' : ''}${klavier ? ' klavier-open' : ''}`}
        data-klavier={klavier ? 'open' : undefined}
        role="dialog"
        aria-modal={ikBoven && !bedekt ? 'true' : undefined}
        aria-label={t('Новий лист', 'Nieuw bericht')}
        ref={dialogRef}
        tabIndex={-1}
        inert={bedekt || undefined}
        onFocusCapture={(event) => { laatsteFocusRef.current = event.target as HTMLElement; }}
        onKeyDown={(event) => { if (ikBoven && !bedekt && !event.defaultPrevented) houdTab(event, focusbaar(dialogRef.current), { houder: dialogRef.current }); }}
        style={
          klavier ? { position: 'fixed', top: (window.visualViewport?.offsetTop || 0), left: 0, right: 0, width: '100vw', height: klavier, maxHeight: klavier, margin: 0, borderRadius: 0 }
          : !groot && rect && typeof window !== 'undefined' && window.innerWidth > 560
            ? { position: 'fixed', top: rect.top, left: rect.left, width: rect.width, height: rect.height, maxHeight: rect.height, margin: 0 }
            : undefined
        }
        onClick={event => event.stopPropagation()}
        onPointerDownCapture={() => { if (stapelBoven(vensters)?.id !== NIEUW_BERICHT_VENSTER) vensterBeheer.naarVoren(NIEUW_BERICHT_VENSTER); }}
        data-bovenaan={stapelBoven(vensters)?.id === NIEUW_BERICHT_VENSTER ? '1' : '0'}
      >
        <span className="mail-new-message-resize mail-new-message-resize-n" onMouseDown={startResize('n')} onPointerDown={startResize('n')} />
        <span className="mail-new-message-resize mail-new-message-resize-s" onMouseDown={startResize('s')} onPointerDown={startResize('s')} />
        <span className="mail-new-message-resize mail-new-message-resize-e" onMouseDown={startResize('e')} onPointerDown={startResize('e')} />
        <span className="mail-new-message-resize mail-new-message-resize-w" onMouseDown={startResize('w')} onPointerDown={startResize('w')} />
        <span className="mail-new-message-resize mail-new-message-resize-ne" onMouseDown={startResize('ne')} onPointerDown={startResize('ne')} />
        <span className="mail-new-message-resize mail-new-message-resize-nw" onMouseDown={startResize('nw')} onPointerDown={startResize('nw')} />
        <span className="mail-new-message-resize mail-new-message-resize-se" onMouseDown={startResize('se')} onPointerDown={startResize('se')} />
        <span className="mail-new-message-resize mail-new-message-resize-sw" onMouseDown={startResize('sw')} onPointerDown={startResize('sw')} />
        <header>
          <Mail aria-hidden="true" />
          <strong>{t('Новий лист', 'Nieuw bericht')}</strong>
          <span className="mail-nm-venster-knoppen">
            <button type="button" aria-label={t('Згорнути (лишиться внизу й у «Чернетках»)', 'Minimaliseren (blijft onderaan en in «Concepten»)')} title={t('Згорнути', 'Minimaliseren')} onClick={close} data-nm-minimaliseer><Minus /></button>
            <button type="button" aria-pressed={groot} aria-label={groot ? t('Відновити розмір', 'Vorige grootte') : t('На весь екран', 'Volledig scherm')} title={groot ? t('Відновити розмір', 'Vorige grootte') : t('На весь екран', 'Volledig scherm')} onClick={() => { setGroot(v => { zetVlag('mail-nm-groot', !v); return !v; }); }} data-nm-maximaliseer>{groot ? <Minimize2 /> : <Maximize2 />}</button>
            <button type="button" aria-label={t('Закрити (чернетка лишиться в «Чернетках»)', 'Sluiten (concept blijft in «Concepten»)')} title={t('Закрити', 'Sluiten')} onClick={sluitHelemaal} data-nm-sluit><X /></button>
          </span>
        </header>
        {/* 1.2: після введення шапка згортається в один рядок; клік або Tab — знову всі поля */}
        {(!kopOpen || (klavier && !kopNaar && !document.activeElement?.closest('[data-nm-kop]'))) && to.trim() ? <button type="button" className="mail-nm-kop-kort" onClick={() => { setKopNaar('aan'); setKopOpen(true); }} onFocus={(e) => { const van = e.relatedTarget as Node | null; setKopNaar(van && dialogRef.current?.contains(van) && (e.currentTarget.compareDocumentPosition(van) & Node.DOCUMENT_POSITION_FOLLOWING) ? 'onderwerp' : 'aan'); setKopOpen(true); }} data-nm-kop-kort aria-label={t('Змінити отримувачів і тему', 'Ontvangers en onderwerp wijzigen')}>
          <span><b>{t('Кому', 'Aan')}:</b> {to}{cc.trim() ? ` · Cc: ${cc}` : ''}{bcc.trim() ? ` · Bcc: ${bcc}` : ''}</span>
          <span><b>{t('Тема', 'Onderwerp')}:</b> {subject.trim() || t('(без теми)', '(geen onderwerp)')}</span>
        </button>
        : <div className="mail-nm-kop" data-nm-kop onBlur={(e) => { const naar = e.relatedTarget as Node | null; /* згортати лише коли фокус перейшов на інший елемент цього вікна (текст листа, кнопки), а не зник через перемальовування */ if (adressenGeldig(to) && naar && dialogRef.current?.contains(naar) && naar !== dialogRef.current && !e.currentTarget.contains(naar)) setKopOpen(false); }}>
        <div className="mail-new-message-field mail-nm-aan">
          <label htmlFor="mail-nm-aan">{t('Кому', 'Aan')}</label>
          <input id="mail-nm-aan" type="text" inputMode="email" autoComplete="email" value={to} onChange={event => setTo(event.target.value)} placeholder="name@example.com" autoFocus={kopOpen && !to} onFocus={() => setAanVerlaten(false)} onBlurCapture={() => setAanVerlaten(true)} aria-invalid={aanVerlaten && to.trim() !== '' && !adressenGeldig(to) ? true : undefined} aria-describedby={aanVerlaten && to.trim() !== '' && !adressenGeldig(to) ? 'mail-nm-aan-fout' : undefined} />
          {aanVerlaten && to.trim() !== '' && !adressenGeldig(to) && <small id="mail-nm-aan-fout" className="mail-nm-aan-fout" role="status">{t('Неповна адреса — приклад: name@example.com', 'Onvolledig adres — bijvoorbeeld: name@example.com')}</small>}
          {/* 21.10 (телефон): Cc/Bcc за замовчуванням сховані за «Cc/Bcc»; розгорнуті — кнопка «згорнути»; згорнуті з адресами — компактний рядок */}
          {!showCc && !(cc.trim() || bcc.trim()) && <button type="button" className="mail-new-message-cc-toggle" onClick={() => { ccFocusRef.current = 'veld'; setShowCc(true); }} data-nm-kopie aria-expanded={false} aria-label={t('Показати поля «Копія» і «Прихована копія» (Cc/Bcc)', 'Velden Cc en Bcc tonen')}>Cc/Bcc</button>}
          {showCc && <button type="button" className="mail-new-message-cc-toggle mail-nm-cc-dicht" onClick={() => { ccFocusRef.current = 'knop'; setShowCc(false); }} data-nm-kopie-dicht aria-expanded={true} aria-controls="mail-nm-cc-velden" aria-label={t('Згорнути Cc/Bcc', 'Cc/Bcc inklappen')} title={t('Згорнути Cc/Bcc', 'Cc/Bcc inklappen')}><ChevronUp aria-hidden="true" /></button>}
        </div>
        {!showCc && (cc.trim() || bcc.trim()) ? (
          <button type="button" className="mail-nm-cc-kort" onClick={() => { ccFocusRef.current = 'veld'; setShowCc(true); }} data-nm-cc-kort aria-expanded={false} aria-label={t('Змінити Cc/Bcc', 'Cc/Bcc wijzigen')}>
            {cc.trim() ? <span><b>Cc:</b> {cc}</span> : null}{bcc.trim() ? <span><b>Bcc:</b> {bcc}</span> : null}
          </button>
        ) : null}
        {showCc && (
          <div id="mail-nm-cc-velden" className="mail-nm-cc-velden" data-nm-cc-velden>
            <label className="mail-new-message-field">
              <span>Cc</span>
              <input value={cc} inputMode="email" autoComplete="email" onChange={event => setCc(event.target.value)} />
            </label>
            <label className="mail-new-message-field">
              <span>Bcc</span>
              <input value={bcc} inputMode="email" autoComplete="email" onChange={event => setBcc(event.target.value)} />
            </label>
          </div>
        )}
        <label className="mail-new-message-field">
          <span>{t('Тема', 'Onderwerp')}</span>
          <input value={subject} data-nm-onderwerp onChange={event => setSubject(event.target.value)} onKeyDown={event => { /* №12: Tab із «Тема» — одразу в текст листа, а не через 10 кнопок форматування */ if (event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) { event.preventDefault(); editorRef.current?.focus(); } }} />
        </label>
        </div>}
        <div className="mail-nm-editor">
        <MailComposeEditor
          ref={editorRef}
          lang={lang}
          value={body}
          onChange={setBody}
          placeholder={t('Напишіть лист…', 'Schrijf een bericht…')}
          onRequestImage={() => imageInputRef.current?.click()}
        />
        {/* кнопка в куті редактора: увесь текст одразу (вікно росте й прокручується) ↔ прокрутка всередині редактора */}
        <button type="button" className="mail-nm-hoek" aria-pressed={heelTekst} title={heelTekst ? t('Прокрутка всередині редактора', 'Scrollen in de editor') : t('Показати весь текст', 'Hele tekst tonen')} aria-label={heelTekst ? t('Прокрутка всередині редактора', 'Scrollen in de editor') : t('Показати весь текст', 'Hele tekst tonen')} onClick={() => setHeelTekst(v => { zetVlag('mail-nm-heel-tekst', !v); return !v; })} data-nm-heel-tekst><ChevronsUpDown /></button>
        </div>
        <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file || !file.type.startsWith('image/') || file.size > 4 * 1024 * 1024) return;
          const reader = new FileReader();
          reader.onload = () => { const src = String(reader.result || ''); if (src.startsWith('data:image/')) editorRef.current?.insertImage(src, file.name); };
          reader.readAsDataURL(file);
        }} />
        {hulpen && <MailInputTools
          lang={lang}
          context={context}
          onInsert={value => editorRef.current?.insertText(value)}
          onBackspace={() => editorRef.current?.backspace()}
        />}
        {bijlagen.length > 0 && <ul className="mail-nm-bijlagen" aria-label={t('Вкладення', 'Bijlagen')}>{bijlagen.map((b) => <li key={b.id}><Paperclip aria-hidden="true" /><span>{b.filename}</span><small>{b.bytes > 1048576 ? `${(b.bytes / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(b.bytes / 1024))} КБ`}</small><button type="button" aria-label={t(`Прибрати ${b.filename}`, `${b.filename} verwijderen`)} onClick={() => setBijlagen((o) => o.filter((x) => x.id !== b.id))}><X aria-hidden="true" /></button></li>)}</ul>}
        <input ref={bestandRef} type="file" multiple hidden onChange={(e) => { const f = [...(e.target.files || [])]; e.target.value = ''; void voegBijlagenToe(f.map((x) => ({ blob: x, filename: x.name, contentType: x.type }))); }} />
        <footer>
          <button type="button" className="mail-nm-bijlage-knop" onClick={() => bestandRef.current?.click()} data-nm-bijlage title={t('Додати файл', 'Bestand toevoegen')} aria-label={t('Додати файл', 'Bestand toevoegen')}><Paperclip aria-hidden="true" /></button>
          <MailDiskKnop lang={lang} context={context} onInsert={(html) => editorRef.current?.insertHtml(html)} onAttach={(f) => setBijlagen((o) => { const alles = [...o, { id: `disk-${Date.now()}`, ...f }]; if (alles.reduce((n, b) => n + b.bytes, 0) > 8 * 1024 * 1024) { setFailure(t('Вкладення разом більші за 8 МБ — вставте посилання на файл.', 'Bijlagen samen groter dan 8 MB — voeg een link in.')); return o; } return alles; })} />
          <MailAiToolbar
            lang={lang}
            context={context}
            getPlain={() => editorRef.current?.getPlainText() ?? ''}
            getHtml={() => body}
            onApply={html => setBody(html)}
            disabled={sending}
          />
          <button type="button" className="mail-nm-hulpen" aria-expanded={hulpen} aria-label={t('Інструменти введення', 'Invoerhulpen')} title={t('Інструменти введення: UA/NL, трансліт, клавіатура, рукопис', 'Invoerhulpen: UA/NL, translit, toetsenbord, handschrift')} onClick={() => setHulpen(v => { zetVlag('mail-nm-hulpen', !v); return !v; })} data-nm-hulpen><Keyboard aria-hidden="true" /><span>{t('Введення', 'Invoer')}</span></button>
          {/* 21.10: «Збережено локально · на сервері о HH:MM» — локальна копія на пристрої + підтвердження сервера (Gmail — у підказці) */}
          <span className={`mail-new-message-sync sync-${draftSync}`} data-draft-sync={draftSync} data-concept-lokaal={lokaal} data-concept-server-op={serverOp || undefined}
            title={`${t('Чернетка зберігається автоматично: одразу на цьому пристрої, за мить — на вашому сервері, потім у Gmail.', 'Het concept wordt automatisch bewaard: meteen op dit apparaat, even later op uw server, daarna in Gmail.')} ${draftSync === 'synced' ? t('У Gmail теж збережено.', 'Ook in Gmail bewaard.') : draftSync === 'local' ? t('У Gmail ще ні.', 'Nog niet in Gmail.') : ''}`}>
            {draftSync === 'saving' ? <LoaderCircle aria-hidden="true" /> : draftSync === 'synced' ? <Cloud aria-hidden="true" /> : draftSync === 'error' ? <CircleAlert aria-hidden="true" /> : draftSync === 'local' ? <Server aria-hidden="true" /> : <CloudOff aria-hidden="true" />}
            <span className="mail-nm-sync-tekst">{conceptStatusTekst(lang, { lokaal, server: draftSync === 'saving' ? 'bezig' : draftSync === 'error' ? 'fout' : draftSync === 'idle' ? (serverOp ? 'ok' : 'idle') : 'ok', serverOp })}</span>
          </span>
          {heeftInhoud && !wisVraag && <button type="button" className="mail-nm-wis" onClick={() => setWisVraag(true)} data-nm-wis aria-label={t('Видалити або очистити чернетку', 'Concept verwijderen of wissen')} title={t('Очистити або видалити чернетку', 'Wissen of concept verwijderen')}><Trash2 aria-hidden="true" /><span>{t('Видалити', 'Verwijderen')}</span></button>}
          <span role="status" style={SR_ALLEEN} data-nm-concept-melding>{conceptMelding}</span>
          {wisVraag && <span className="mail-nm-wis-vraag" role="group" aria-label={t('Видалити чернетку?', 'Concept verwijderen?')} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setWisVraag(false); } }}>
            <button type="button" className="gevaar" onClick={verwijderConcept} data-nm-wis-bevestig><Trash2 aria-hidden="true" />{t('Видалити чернетку', 'Concept verwijderen')}</button>
            <button type="button" onClick={() => { gooiWeg(); setWisVraag(false); }} data-nm-leeg>{t('Лише очистити', 'Alleen wissen')}</button>
            <button type="button" onClick={() => setWisVraag(false)} data-nm-wis-annuleer>{t('Скасувати', 'Annuleren')}</button>
          </span>}
          <MailScheduleMenu lang={lang} context={context} canSchedule={Boolean(accountId && to.trim() && body.trim())} onSchedule={scheduleSend} busy={sending} />
          <button type="button" className="primary" disabled={sending || !adressenGeldig(to) || (cc.trim() !== '' && !adressenGeldig(cc)) || (bcc.trim() !== '' && !adressenGeldig(bcc)) || !body.trim()} title={to.trim() && !adressenGeldig(to) ? t('Перевірте адресу в полі «Кому»', 'Controleer het adres bij «Aan»') : undefined} onClick={() => void send()}>
            <Send />
            {sending ? t('Надсилаємо…', 'Verzenden…') : t('Надіслати', 'Verzenden')}
          </button>
        </footer>
        {failure && <p className="mail-new-message-error" role="alert">{failure}</p>}
      </section>
    </div>
  );
}
