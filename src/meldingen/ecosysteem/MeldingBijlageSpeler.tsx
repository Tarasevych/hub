// Універсальний конфіденційний вбудований переглядач і програвач усіх форматів вкладень («застосунок у застосунку», GEMINI-002).
// Відтворює зображення, відео, аудіо, PDF, документи, таблиці, бази даних, презентації, архіви, календарі (.ics),
// контакти (.vcf), цифрові підписи (.p7s), код, журнали, різниці (diff) та довільні бінарні файли (HEX-інспектор)
// без переходу на сторонні вебсайти.

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  ContactRound,
  Copy,
  Database,
  Download,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Image as ImageIcon,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Presentation,
  RotateCw,
  ShieldCheck,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import {
  classificeerBijlage,
  formaatGrootte,
  schoonSvgTekst,
  veiligeMeldingUrl,
  type BijlageWeergaveVoorkeur,
  type MeldingBijlage,
} from '../../../shared/meldingen-ecosysteem';
import type { MailAttachmentPreview } from '../../MailBijlageVoorbeeld';
import type { ContextActie } from '../../bijlage-weergave/Weergave';
import { useVlag } from '../../functievlag-lezen';
import { WEERGAVE_VLAG } from '../../bijlage-weergave/soort';

// SPIL-WEERGAVE етап 4, НЕ ПЕРЕВІРЕНО (Claude Opus 5.5 (High) через Antigravity): за прапорцем bijlage-weergave-gedeeld-v1
// замість власної шапки програвача — спільна шапка переглядача й стрічка вкладень (окремим шматком; поки вантажиться — стара шапка).
// Без прапорця все як раніше. Тіло (рушії форматів) не змінюється.
const WeergaveKopLui = lazy(() => import('../../bijlage-weergave/Weergave').then((m) => ({ default: m.WeergaveKop })));
const WeergaveStrookLui = lazy(() => import('../../bijlage-weergave/Weergave').then((m) => ({ default: m.WeergaveStrook })));

const LazyMailPreviewContent = lazy(() =>
  import('../../MailBijlageVoorbeeld').then((m) => ({ default: m.MailAttachmentPreviewContent })),
);

function base64NaarBytes(b64: string): Uint8Array {
  const schoon = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64;
  const bin = atob(schoon);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesNaarHexDump(bytes: Uint8Array, limiet = 1024): string {
  const stuk = bytes.subarray(0, Math.min(bytes.length, limiet));
  const rijen: string[] = [];
  for (let i = 0; i < stuk.length; i += 16) {
    const blok = stuk.subarray(i, i + 16);
    const offset = i.toString(16).padStart(6, '0');
    const hex = Array.from(blok, (b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(47, ' ');
    const ascii = Array.from(blok, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    rijen.push(`${offset}  ${hex}  |${ascii}|`);
  }
  return rijen.join('\n');
}

function parseCsvRegels(tekst: string, scheiding = ','): string[][] {
  const rijen: string[][] = [];
  let rij: string[] = [];
  let cel = '';
  let inQuotes = false;
  const s = tekst.slice(0, 64_000);
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"' && s[i + 1] === '"') {
        cel += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cel += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === scheiding) {
      rij.push(cel);
      cel = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      rij.push(cel);
      if (rij.some((c) => c !== '')) rijen.push(rij);
      rij = [];
      cel = '';
      if (rijen.length >= 120) break;
    } else {
      cel += ch;
    }
  }
  if (cel !== '' || rij.length) {
    rij.push(cel);
    rijen.push(rij);
  }
  return rijen;
}

function parseIcsEenvoudig(tekst: string) {
  const blokken = tekst.split(/BEGIN:VEVENT/i).slice(1, 20);
  return blokken.map((b) => {
    const veld = (naam: string) => {
      const m = new RegExp(`^${naam}(?:;[^:]*)?:(.*)$`, 'im').exec(b);
      return m ? m[1].replace(/\\n/g, ' ').replace(/\\,/g, ',').trim() : '';
    };
    return {
      samenvatting: veld('SUMMARY'),
      start: veld('DTSTART'),
      eind: veld('DTEND'),
      locatie: veld('LOCATION'),
      omschrijving: veld('DESCRIPTION'),
    };
  });
}

function parseVcardEenvoudig(tekst: string) {
  const lijnen = tekst.split(/\r?\n/);
  let naam = '';
  let org = '';
  const telefoons: string[] = [];
  const emails: string[] = [];
  for (const l of lijnen) {
    if (/^FN[:;]/i.test(l)) naam = l.slice(l.indexOf(':') + 1).trim();
    else if (/^ORG[:;]/i.test(l)) org = l.slice(l.indexOf(':') + 1).replace(/;/g, ' · ').trim();
    else if (/^TEL[:;]/i.test(l)) telefoons.push(l.slice(l.indexOf(':') + 1).trim());
    else if (/^EMAIL[:;]/i.test(l)) emails.push(l.slice(l.indexOf(':') + 1).trim());
  }
  return { naam, org, telefoons, emails };
}

export function IcoonVoorFormaat({ weergave }: { weergave: ReturnType<typeof classificeerBijlage>['weergave'] }) {
  if (weergave === 'beeld') return <ImageIcon aria-hidden='true' />;
  if (weergave === 'video') return <FileVideo aria-hidden='true' />;
  if (weergave === 'audio') return <FileAudio aria-hidden='true' />;
  if (weergave === 'werkblad') return <FileSpreadsheet aria-hidden='true' />;
  if (weergave === 'database') return <Database aria-hidden='true' />;
  if (weergave === 'presentatie') return <Presentation aria-hidden='true' />;
  if (weergave === 'archief') return <Archive aria-hidden='true' />;
  if (weergave === 'agenda') return <Calendar aria-hidden='true' />;
  if (weergave === 'contact') return <ContactRound aria-hidden='true' />;
  if (weergave === 'handtekening') return <ShieldCheck aria-hidden='true' />;
  if (weergave === 'code') return <Code2 aria-hidden='true' />;
  return <FileText aria-hidden='true' />;
}

type Props = {
  lang: 'uk' | 'nl';
  bijlagen: MeldingBijlage[];
  actieveIndex: number;
  voorkeur: BijlageWeergaveVoorkeur;
  modaal?: boolean;
  onSelectIndex?: (idx: number) => void;
  onSluiten?: () => void;
  onToggleModaal?: () => void;
  /** етап 4 (НЕ ПЕРЕВІРЕНО): дії сповіщення для спільної шапки (наприклад «Прочитано», швидка дія); лише з увімкненим прапорцем */
  contextActies?: ContextActie[] | null;
};

export default function MeldingBijlageSpeler({
  lang,
  bijlagen,
  actieveIndex,
  voorkeur,
  modaal = false,
  onSelectIndex,
  onSluiten,
  onToggleModaal,
  contextActies,
}: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const bijlage = bijlagen[actieveIndex] ?? bijlagen[0];
  const info = useMemo(
    () => (bijlage ? classificeerBijlage(bijlage) : null),
    [bijlage?.naam, bijlage?.mime],
  );

  const [zoom, setZoom] = useState(1);
  const [rotatie, setRotatie] = useState(0);
  const [gekopieerd, setGekopieerd] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string>('');
  const [tekstInhoud, setTekstInhoud] = useState<string>('');
  const [hexDump, setHexDump] = useState<string>('');
  const [mailVoorbeeld, setMailVoorbeeld] = useState<MailAttachmentPreview | null>(null);
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState('');
  const mailPreviewRef = useRef<MailAttachmentPreview | null>(null);
  // етап 4: сам файл для позначки довіри й «Подробиць» спільної шапки (раніше зберігалося лише посилання)
  const [bronBlob, setBronBlob] = useState<Blob | null>(null);
  const gedeeld = useVlag(WEERGAVE_VLAG, false);
  const copyTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    if (copyTimerRef.current !== undefined) window.clearTimeout(copyTimerRef.current);
  }, []);

  useEffect(() => {
    setZoom(1);
    setRotatie(0);
    setFout('');
  }, [bijlage?.id, bijlage?.naam]);

  useEffect(() => {
    if (!bijlage || !info) return;
    let gestopt = false;
    let lokaalUrl = '';
    setMailVoorbeeld(null);
    setHexDump('');
    setObjectUrl('');
    setBronBlob(null);
    setTekstInhoud(bijlage.tekstVoorbeeld || '');

    const prepareer = async () => {
      const teGroot = bijlage.grootteBytes > voorkeur.maxVoorbeeldMb * 1024 * 1024;
      if (teGroot && !bijlage.tekstVoorbeeld) {
        setFout(
          t(
            `Файл (${formaatGrootte(bijlage.grootteBytes)}) перевищує межу автоперегляду (${voorkeur.maxVoorbeeldMb} MB). Можна змінити межу в налаштуваннях або зберегти локально.`,
            `Bestand (${formaatGrootte(bijlage.grootteBytes)}) overschrijdt de drempel voor voorvertoning (${voorkeur.maxVoorbeeldMb} MB).`,
          ),
        );
        return;
      }

      const isSvg = info.mime === 'image/svg+xml' || bijlage.naam.toLowerCase().endsWith('.svg');
      const sanitizeSvg = (ruwSvg: string): string => {
        const stap1 = schoonSvgTekst(ruwSvg);
        try {
          if (typeof window !== 'undefined' && typeof DOMPurify?.sanitize === 'function') {
            return DOMPurify.sanitize(stap1, {
              USE_PROFILES: { svg: true, svgFilters: true },
              FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'object', 'embed', 'base', 'link', 'meta', 'handler'],
              FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'onfocus', 'onanimationstart'],
            });
          }
        } catch {
          /* базове очищення вже застосоване */
        }
        return stap1;
      };

      let blob: Blob | null = null;
      if (bijlage.inhoudBase64) {
        try {
          const bytes = base64NaarBytes(bijlage.inhoudBase64);
          if (isSvg) {
            const schoon = sanitizeSvg(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
            blob = new Blob([schoon], { type: 'image/svg+xml' });
          } else {
            blob = new Blob([bytes as unknown as BlobPart], { type: info.mime });
          }
        } catch {
          setFout(t('Не вдалося розкодувати вміст вкладення.', 'Kan de bijlage-inhoud niet decoderen.'));
        }
      } else if (bijlage.tekstVoorbeeld) {
        if (isSvg) {
          const schoon = sanitizeSvg(bijlage.tekstVoorbeeld);
          blob = new Blob([schoon], { type: 'image/svg+xml' });
        } else {
          blob = new Blob([bijlage.tekstVoorbeeld], { type: info.mime });
        }
      } else if (bijlage.url && !['beeld', 'video', 'audio', 'pdf'].includes(info.weergave)) {
        // Для текстових, табличних, архівних та офісних файлів підвантажуємо через безпечне завантаження у межах сеансу
        const veiligVoorFetch =
          (bijlage.url.startsWith('/') && !bijlage.url.startsWith('//')) ||
          (typeof window !== 'undefined' && bijlage.url.startsWith(window.location.origin)) ||
          bijlage.url.startsWith('blob:');
        if (veiligVoorFetch) {
          setLaden(true);
          try {
            const resp = await fetch(bijlage.url, { credentials: 'same-origin' });
            if (resp.ok) blob = await resp.blob();
          } catch {
            /* залишаємо метадані / пряме посилання */
          } finally {
            if (!gestopt) setLaden(false);
          }
        }
      }

      if (gestopt) return;

      if (blob) {
        lokaalUrl = URL.createObjectURL(blob);
        setObjectUrl(lokaalUrl);
        setBronBlob(blob);

        if ((info.weergave === 'code' || info.weergave === 'tekst' || info.weergave === 'agenda' || info.weergave === 'contact' || (info.weergave === 'werkblad' && (bijlage.naam.endsWith('.csv') || bijlage.naam.endsWith('.tsv')))) && !bijlage.tekstVoorbeeld) {
          try {
            const bytes = new Uint8Array(await blob.slice(0, 128_000).arrayBuffer());
            if (!gestopt) setTekstInhoud(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
          } catch {
            /* ігноруємо */
          }
        }

        if (voorkeur.hexFallback && ['hex', 'database', 'handtekening', 'archief', 'document', 'presentatie'].includes(info.weergave)) {
          try {
            const bytes = new Uint8Array(await blob.slice(0, 1024).arrayBuffer());
            if (!gestopt) setHexDump(bytesNaarHexDump(bytes));
          } catch {
            /* ігноруємо */
          }
        }

        if (['document', 'database', 'presentatie', 'archief', 'handtekening', 'pdf'].includes(info.weergave) || (info.weergave === 'werkblad' && !bijlage.naam.endsWith('.csv') && !bijlage.naam.endsWith('.tsv'))) {
          try {
            setLaden(true);
            const { loadMailAttachmentPreviewFromBlob, revokeMailAttachmentPreview } = await import('../../MailBijlageVoorbeeld');
            const preview = await loadMailAttachmentPreviewFromBlob({
              blob,
              filename: bijlage.naam,
              contentType: info.mime,
            });
            if (gestopt) {
              revokeMailAttachmentPreview(preview);
              return;
            }
            mailPreviewRef.current = preview;
            setMailVoorbeeld(preview);
          } catch {
            /* залишаємо прямий візуалізатор / HEX */
          } finally {
            if (!gestopt) setLaden(false);
          }
        }
      } else if (bijlage.url) {
        const veiligeUrl = veiligeMeldingUrl(bijlage.url, 800) || (bijlage.url.startsWith('blob:') ? bijlage.url : '');
        setObjectUrl(veiligeUrl);
      } else {
        setObjectUrl('');
      }
    };

    void prepareer();

    return () => {
      gestopt = true;
      if (lokaalUrl) URL.revokeObjectURL(lokaalUrl);
      if (mailPreviewRef.current) {
        const ref = mailPreviewRef.current;
        mailPreviewRef.current = null;
        void import('../../MailBijlageVoorbeeld').then((m) => m.revokeMailAttachmentPreview(ref)).catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bijlage?.id, bijlage?.naam, bijlage?.url, bijlage?.inhoudBase64, bijlage?.tekstVoorbeeld, bijlage?.grootteBytes, voorkeur.maxVoorbeeldMb, voorkeur.hexFallback]);

  if (!bijlage || !info) return null;

  const isDiff = bijlage.naam.endsWith('.diff') || bijlage.naam.endsWith('.patch');
  const isJson = bijlage.naam.endsWith('.json') || info.mime.includes('json');
  const isCsv = bijlage.naam.endsWith('.csv') || info.mime === 'text/csv';
  const isTsv = bijlage.naam.endsWith('.tsv') || info.mime === 'text/tab-separated-values';

  const kopieerTekst = async () => {
    const data = tekstInhoud || hexDump || `${bijlage.naam} (${info.mime}, ${formaatGrootte(bijlage.grootteBytes)})`;
    try {
      await navigator.clipboard.writeText(data);
      setGekopieerd(true);
      if (copyTimerRef.current !== undefined) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setGekopieerd(false), 1800);
    } catch {
      /* буфер обміну недоступний */
    }
  };

  const renderInhoud = () => {
    if (laden) {
      return (
        <div className='mel-speler-status'>
          <LoaderCircle className='mel-draai' aria-hidden='true' />
          <span>{t('Підготовка безпечного перегляду…', 'Veilige voorvertoning laden…')}</span>
        </div>
      );
    }
    if (fout) {
      return <div className='mel-speler-waarschuwing'>{fout}</div>;
    }

    if (mailVoorbeeld && info.weergave !== 'beeld' && info.weergave !== 'video' && info.weergave !== 'audio' && !(info.weergave === 'pdf' && objectUrl)) {
      return (
        <div className='mel-speler-rijk'>
          <Suspense fallback={<LoaderCircle className='mel-draai' aria-hidden='true' />}>
            <LazyMailPreviewContent preview={mailVoorbeeld} lang={lang} />
          </Suspense>
        </div>
      );
    }

    if (info.weergave === 'beeld' && objectUrl) {
      return (
        <div className='mel-speler-beeld-doek'>
          <div className='mel-speler-gereedschap'>
            <button type='button' className='mel-ikoon-knop' onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.25).toFixed(2)))} aria-label={t('Зменшити', 'Uitzoomen')}>
              <ZoomOut aria-hidden='true' />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type='button' className='mel-ikoon-knop' onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} aria-label={t('Збільшити', 'Inzoomen')}>
              <ZoomIn aria-hidden='true' />
            </button>
            <button type='button' className='mel-ikoon-knop' onClick={() => setRotatie((r) => (r + 90) % 360)} aria-label={t('Повернути', 'Draaien')}>
              <RotateCw aria-hidden='true' />
            </button>
          </div>
          <div className='mel-speler-beeld-kader'>
            <img
              src={objectUrl}
              alt={bijlage.naam}
              style={{ transform: `scale(${zoom}) rotate(${rotatie}deg)` }}
            />
          </div>
        </div>
      );
    }

    if (info.weergave === 'video' && objectUrl) {
      return (
        <div className='mel-speler-media'>
          <video controls playsInline preload='metadata' src={objectUrl} />
        </div>
      );
    }

    if (info.weergave === 'audio' && objectUrl) {
      return (
        <div className='mel-speler-audio'>
          <div className='mel-speler-audio-kaart'>
            <FileAudio aria-hidden='true' />
            <div>
              <strong>{bijlage.naam}</strong>
              <small>{lang === 'nl' ? info.nl : info.uk} · {formaatGrootte(bijlage.grootteBytes)}</small>
            </div>
          </div>
          <audio controls preload='metadata' src={objectUrl} />
        </div>
      );
    }

    if (info.weergave === 'pdf' && objectUrl) {
      const veiligFrame =
        objectUrl.startsWith('blob:') ||
        (objectUrl.startsWith('/') && !objectUrl.startsWith('//')) ||
        (typeof window !== 'undefined' && objectUrl.startsWith(window.location.origin));
      if (veiligFrame) {
        return <iframe className='mel-speler-pdf' src={objectUrl} title={bijlage.naam} />;
      }
    }

    if (info.weergave === 'agenda' && tekstInhoud) {
      const events = parseIcsEenvoudig(tekstInhoud);
      if (events.length) {
        return (
          <div className='mel-speler-kaarten'>
            {events.map((ev, idx) => (
              <article key={idx} className='mel-speler-kaart-item'>
                <strong>{ev.samenvatting || t('Подія без назви', 'Naamloze afspraak')}</strong>
                <small>{[ev.start, ev.eind].filter(Boolean).join(' → ')}</small>
                {ev.locatie && <small>{ev.locatie}</small>}
                {ev.omschrijving && <p>{ev.omschrijving}</p>}
              </article>
            ))}
          </div>
        );
      }
    }

    if (info.weergave === 'contact' && tekstInhoud) {
      const c = parseVcardEenvoudig(tekstInhoud);
      return (
        <div className='mel-speler-kaarten'>
          <article className='mel-speler-kaart-item'>
            <strong>{c.naam || t('Контактна картка', 'Contactkaart')}</strong>
            {c.org && <small>{c.org}</small>}
            {c.telefoons.map((tel, i) => <span key={i}>{tel}</span>)}
            {c.emails.map((em, i) => <span key={i}>{em}</span>)}
          </article>
        </div>
      );
    }

    if ((isCsv || isTsv) && tekstInhoud) {
      const rijen = parseCsvRegels(tekstInhoud, isTsv ? '\t' : ',');
      if (rijen.length) {
        const kop = rijen[0];
        const lichaam = rijen.slice(1);
        return (
          <div className='mel-speler-tabel-kader'>
            <table className='mel-speler-tabel'>
              <thead>
                <tr>
                  {kop.map((k, idx) => <th key={idx}>{k}</th>)}
                </tr>
              </thead>
              <tbody>
                {lichaam.map((rij, rIdx) => (
                  <tr key={rIdx}>
                    {kop.map((_, cIdx) => <td key={cIdx}>{rij[cIdx] ?? ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
    }

    if (tekstInhoud) {
      let geformatteerd = tekstInhoud;
      if (isJson) {
        try {
          geformatteerd = JSON.stringify(JSON.parse(tekstInhoud), null, 2);
        } catch {
          /* залишаємо як є */
        }
      }
      const regels = geformatteerd.split(/\r?\n/).slice(0, 600);
      return (
        <div className='mel-speler-code'>
          {regels.map((r, i) => {
            const klas = isDiff
              ? r.startsWith('+') && !r.startsWith('+++')
                ? 'is-plus'
                : r.startsWith('-') && !r.startsWith('---')
                  ? 'is-min'
                  : r.startsWith('@@')
                    ? 'is-stuk'
                    : ''
              : '';
            return (
              <div key={i} className={`mel-speler-regel ${klas}`}>
                <span className='mel-nr'>{i + 1}</span>
                <code>{r || ' '}</code>
              </div>
            );
          })}
        </div>
      );
    }

    if (hexDump) {
      return (
        <div className='mel-speler-hex'>
          <div className='mel-speler-meta-rij'>
            <span>MIME: <code>{info.mime}</code></span>
            <span>{formaatGrootte(bijlage.grootteBytes)}</span>
          </div>
          <pre>{hexDump}</pre>
        </div>
      );
    }

    return (
      <div className='mel-speler-leeg'>
        <IcoonVoorFormaat weergave={info.weergave} />
        <strong>{bijlage.naam}</strong>
        <small>{lang === 'nl' ? info.nl : info.uk} · {info.mime} · {formaatGrootte(bijlage.grootteBytes)}</small>
        <span>
          {t(
            'Для цього вкладення наразі передано лише метадані. Завантажте або відкрийте оригінал у сервісі-джерелі.',
            'Voor deze bijlage zijn alleen metagegevens beschikbaar. Open of download het bestand vanuit de brondienst.',
          )}
        </span>
      </div>
    );
  };

  const oudeKop = (
      <div className='mel-speler-kop'>
        <div className='mel-speler-titel'>
          <span className='mel-speler-badge' style={{ borderColor: info.kleur, color: info.kleur }}>
            <IcoonVoorFormaat weergave={info.weergave} />
            {info.label}
          </span>
          <div className='mel-speler-naam'>
            <strong title={bijlage.naam}>{bijlage.naam}</strong>
            <small>
              {lang === 'nl' ? info.nl : info.uk} · {formaatGrootte(bijlage.grootteBytes)}
            </small>
          </div>
        </div>

        <div className='mel-speler-acties'>
          {bijlagen.length > 1 && onSelectIndex && (
            <div className='mel-speler-nav'>
              <button
                type='button'
                className='mel-ikoon-knop'
                disabled={actieveIndex <= 0}
                onClick={() => onSelectIndex(actieveIndex - 1)}
                aria-label={t('Попереднє вкладення', 'Vorige bijlage')}
              >
                <ChevronLeft aria-hidden='true' />
              </button>
              <span className='mel-speler-teller'>
                {actieveIndex + 1}/{bijlagen.length}
              </span>
              <button
                type='button'
                className='mel-ikoon-knop'
                disabled={actieveIndex >= bijlagen.length - 1}
                onClick={() => onSelectIndex(actieveIndex + 1)}
                aria-label={t('Наступне вкладення', 'Volgende bijlage')}
              >
                <ChevronRight aria-hidden='true' />
              </button>
            </div>
          )}

          {(tekstInhoud || hexDump) && (
            <button
              type='button'
              className='mel-ikoon-knop'
              onClick={() => void kopieerTekst()}
              aria-label={t('Копіювати вміст', 'Inhoud kopiëren')}
              title={t('Копіювати вміст', 'Inhoud kopiëren')}
            >
              {gekopieerd ? <Check aria-hidden='true' /> : <Copy aria-hidden='true' />}
            </button>
          )}

          {objectUrl && (
            <a
              href={objectUrl}
              download={bijlage.naam}
              className='mel-ikoon-knop'
              aria-label={t('Зберегти файл', 'Bestand downloaden')}
              title={t('Зберегти файл', 'Bestand downloaden')}
            >
              <Download aria-hidden='true' />
            </a>
          )}

          {onToggleModaal && (
            <button
              type='button'
              className='mel-ikoon-knop'
              onClick={onToggleModaal}
              aria-label={modaal ? t('Згорнути в картку', 'In kaart tonen') : t('Розгорнути переглядач', 'Volledig tonen')}
              title={modaal ? t('Згорнути в картку', 'In kaart tonen') : t('Розгорнути переглядач', 'Volledig tonen')}
            >
              {modaal ? <Minimize2 aria-hidden='true' /> : <Maximize2 aria-hidden='true' />}
            </button>
          )}

          {onSluiten && (
            <button
              type='button'
              className='mel-ikoon-knop'
              onClick={onSluiten}
              aria-label={t('Закрити перегляд вкладення', 'Bijlageweergave sluiten')}
              title={t('Закрити перегляд вкладення', 'Bijlageweergave sluiten')}
            >
              <X aria-hidden='true' />
            </button>
          )}
        </div>
      </div>
  );
  // етап 4: дії, які спільна шапка не знає сама — копіювання, розгортання — йдуть як контекстні; дії сповіщення приходять ззовні
  const melActies: ContextActie[] = [
    ...(contextActies || []),
    ...((tekstInhoud || hexDump) ? [{ sleutel: 'kopieer', label: ['Копіювати вміст', 'Inhoud kopiëren'] as [string, string], icoon: Copy, uitvoeren: () => void kopieerTekst() }] : []),
    ...(onToggleModaal && !modaal ? [{ sleutel: 'groot', label: ['Розгорнути переглядач', 'Volledig tonen'] as [string, string], icoon: Maximize2, uitvoeren: onToggleModaal }] : []),
  ];
  const gedeeldeKop = (
    <WeergaveKopLui
      taal={lang}
      bron='melding'
      kopElement='div'
      naam={bijlage.naam}
      contentType={info.mime}
      grootte={Number(bijlage.grootteBytes || 0)}
      blob={bronBlob}
      nav={bijlagen.length > 1 ? { index: actieveIndex, totaal: bijlagen.length } : null}
      beschikbaar={{
        ...(objectUrl ? { download: () => { const a = document.createElement('a'); a.href = objectUrl; a.download = bijlage.naam; document.body.appendChild(a); a.click(); a.remove(); } } : {}),
        ...(onToggleModaal && modaal ? { minimaliseer: onToggleModaal } : {}),
      }}
      contextActies={melActies}
      zonderSluiten={!onSluiten}
      onSluit={onSluiten || (() => undefined)}
    />
  );

  const inhoud = (
    <div
      className={`mel-speler${modaal ? ' is-modaal' : ''}`}
      data-weergave-drager={gedeeld ? 'melding' : undefined}
      data-testid='mel-bijlage-speler'
      data-weergave={info.weergave}
      onClick={(e) => e.stopPropagation()}
    >
      {gedeeld ? <Suspense fallback={oudeKop}>{gedeeldeKop}</Suspense> : oudeKop}

      <div className='mel-speler-lichaam'>{renderInhoud()}</div>
      {gedeeld && bijlagen.length > 1 && onSelectIndex && (
        <Suspense fallback={null}>
          <WeergaveStrookLui taal={lang} bron='melding' index={actieveIndex} onKies={onSelectIndex}
            items={bijlagen.map((b) => ({ naam: b.naam, contentType: b.mime || '', grootte: Number(b.grootteBytes || 0) }))} />
        </Suspense>
      )}
    </div>
  );

  if (modaal && typeof document !== 'undefined' && document.body) {
    const portaalDoel = document.querySelector<HTMLElement>('.canonical-chrome') || document.body;
    return createPortal(
      <div
        className='mel-bijlage-portaal'
        data-no-edge-swipe='1'
        role='dialog'
        aria-modal='true'
        aria-label={bijlage.naam}
        onClick={onSluiten}
      >
        {inhoud}
      </div>,
      portaalDoel,
    );
  }

  return inhoud;
}
