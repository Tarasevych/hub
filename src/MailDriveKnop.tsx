// 3.1: Google Диск прямо в листі. Кнопка в нижньому рядку: якщо Диск підключено — список файлів із пошуком, клік вставляє в лист
// посилання на файл (одержувач відкриває його за правами доступу Диска). Не підключено — кнопка сіра, клік відкриває швидке
// підключення в новій вкладці (без переходу в загальні налаштування в цій вкладці).
import { useEffect, useRef, useState } from 'react';
import { HardDrive, LoaderCircle, Search, X } from 'lucide-react';
import { api } from './platform/client';
import { canonicalNavigationUrl } from './canoniek-navigatie';

type Bestand = { id: string; name: string; mimeType: string; folder: boolean; modifiedAt: number };
type Props = { lang: 'uk' | 'nl'; context: Record<string, string>; onInsert: (html: string) => void; onAttach?: (f: { filename: string; contentType: string; data: string; bytes: number }) => void };
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default function MailDiskKnop({ lang, context, onInsert, onAttach }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [stand, setStand] = useState<'onbekend' | 'ok' | 'niet'>('onbekend');
  const [open, setOpen] = useState(false);
  const [zoek, setZoek] = useState('');
  const [map, setMap] = useState<{ id: string; naam: string }[]>([{ id: 'root', naam: t('Мій диск', 'Mijn Drive') }]);
  const [lijst, setLijst] = useState<Bestand[]>([]);
  const [bezig, setBezig] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const laad = async (folderId: string, query: string) => {
    setBezig(true);
    try { const r = await api.post('/api/owner/cloud/google-suite/drive/browse', { ...context, accountId: '', folderId, query }); setLijst(((r.data as { files?: Bestand[] }).files || []).slice(0, 60)); setStand('ok'); }
    catch { setStand('niet'); setLijst([]); }
    finally { setBezig(false); }
  };
  // QA 12.10 №17: Диск перевіряємо лише після натискання кнопки — не при кожному відкритті нового листа (інакше 409 у консолі, коли Диск не підключено).
  useEffect(() => { if (!open) return; const weg = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); }; const esc2 = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; document.addEventListener('pointerdown', weg, true); document.addEventListener('keydown', esc2); return () => { document.removeEventListener('pointerdown', weg, true); document.removeEventListener('keydown', esc2); }; }, [open]);
  useEffect(() => { if (!open || stand !== 'ok') return; const h = window.setTimeout(() => void laad(zoek.trim() ? 'root' : map[map.length - 1].id, zoek.trim()), zoek ? 300 : 0); return () => window.clearTimeout(h); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [zoek, map, open]);
  const [fout, setFout] = useState('');
  const vergrendel = useRef(false);
  const vk = async (b: Bestand) => {
    if (!onAttach || vergrendel.current) return; vergrendel.current = true; setBezig(true); setFout('');
    try { const r = (await api.post('/api/owner/cloud/google-suite/drive/file', { ...context, accountId: '', fileId: b.id })).data as { name: string; mimeType: string; sizeBytes: number; data: string }; onAttach({ filename: r.name || b.name, contentType: r.mimeType || 'application/octet-stream', data: r.data, bytes: r.sizeBytes }); setOpen(false); }
    catch { setFout(t('Файл не вдалося вкласти (завеликий або недоступний). Вставте посилання.', 'Bestand kon niet worden bijgevoegd (te groot of niet beschikbaar). Voeg een link in.')); }
    finally { vergrendel.current = false; setBezig(false); }
  };
  const kies = (b: Bestand) => {
    if (b.folder) { setZoek(''); setMap((m) => [...m, { id: b.id, naam: b.name }]); return; }
    onInsert(`<a href="https://drive.google.com/open?id=${encodeURIComponent(b.id)}">📎 ${esc(b.name)}</a>&nbsp;`);
    setOpen(false);
  };
  const verbinden = () => window.open(canonicalNavigationUrl('cloud', 'accounts', lang), '_blank', 'noopener');
  return <div className='mail-disk' ref={root} data-disk-stand={stand}>
    <button type='button' className={`mail-disk-knop${stand === 'niet' ? ' grijs' : ''}`} aria-expanded={open} data-nm-disk
      title={stand === 'niet' ? t('Google Диск не підключено — натисніть, щоб підключити', 'Google Drive niet verbonden — klik om te verbinden') : t('Вставити файл із Google Диска (посилання)', 'Bestand uit Google Drive invoegen (link)')}
      aria-label={stand === 'niet' ? t('Підключити Google Диск', 'Google Drive verbinden') : t('Файл із Google Диска', 'Bestand uit Google Drive')}
      onClick={() => { if (stand === 'niet') { verbinden(); return; } if (stand === 'onbekend' && !open) void laad('root', ''); setOpen((v) => !v); }}><HardDrive aria-hidden='true' /></button>
    {open && <div className='mail-disk-paneel' role='dialog' aria-label={t('Google Диск', 'Google Drive')}>
      <header><strong>{map.map((m) => m.naam).join(' / ')}</strong><button type='button' aria-label={t('Закрити', 'Sluiten')} onClick={() => setOpen(false)}><X aria-hidden='true' /></button></header>
      <label className='mail-disk-zoek'><Search aria-hidden='true' /><input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={t('Пошук на Диску', 'Zoeken in Drive')} aria-label={t('Пошук на Диску', 'Zoeken in Drive')} /></label>
      {map.length > 1 && !zoek && <button type='button' className='mail-disk-terug' onClick={() => setMap((m) => m.slice(0, -1))}>← {t('Назад', 'Terug')}</button>}
      <ul>{bezig ? <li className='leeg'><LoaderCircle className='spin' aria-hidden='true' /></li> : lijst.length ? lijst.map((b) => <li key={b.id} className='mail-disk-rij'><button type='button' onClick={() => kies(b)} title={b.folder ? t('Відкрити папку', 'Map openen') : t('Вставити посилання', 'Link invoegen')}><span aria-hidden='true'>{b.folder ? '📁' : '📄'}</span><span>{b.name}</span></button>{!b.folder && onAttach && <button type='button' className='mail-disk-vk' onClick={() => void vk(b)} aria-label={t(`Вкласти файл ${b.name}`, `Bestand ${b.name} bijvoegen`)} title={t('Вкласти сам файл', 'Bestand zelf bijvoegen')} data-disk-vk>📎</button>}</li>) : <li className='leeg'>{stand === 'niet' ? <>{t('Google Диск не підключено.', 'Google Drive is niet verbonden.')} <button type='button' className='mail-disk-verbind' onClick={verbinden}>{t('Підключити', 'Verbinden')}</button></> : t('Нічого не знайдено', 'Niets gevonden')}</li>}</ul>
      {fout && <p className='mail-disk-fout' role='alert'>{fout}</p>}
      <small>{t('Клік по назві — посилання (доступ за налаштуваннями Диска); 📎 — вкласти сам файл.', 'Klik op de naam — link (toegang volgens Drive); 📎 — bestand zelf bijvoegen.')}</small>
    </div>}
  </div>;
}
