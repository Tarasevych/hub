// UITROL-001 · Вікно «Звіт про проблему»: опис (від вас), що включити, попередній перегляд і копіювання/збереження .md.
// Усе, що потрапляє в текст, проходить маскування секретів (probleem-rapport.ts); у вікні видно, що саме приховано.
// UITROL-001 · Venster «Probleemrapport»: beschrijving, keuze van de delen, voorbeeld, kopiëren of opslaan als .md. Zonder geheimen.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ClipboardCopy, Download, FileText, ShieldCheck, X } from 'lucide-react';
import { kopieerNaarKlembord } from './kopieer';
import { rapportTekst, type RapportDelen, type RapportInvoer } from './probleem-rapport';
import { emitCanonicalNotice } from '../canoniek-meldingen';
import { bestandOpslaan, tr, type Lang } from './types';

const DELEN: Array<{ id: keyof RapportDelen; uk: string; nl: string; tipUk: string; tipNl: string }> = [
  { id: 'oorzaak', uk: 'Причина', nl: 'Oorzaak', tipUk: 'Міграція, рядок, обмеження, помилка PostgreSQL і фрагмент SQL — найважливіше для агента.', tipNl: 'Migratie, regel, beperking, PostgreSQL-fout en SQL-fragment — het belangrijkste voor de agent.' },
  { id: 'vereisten', uk: 'Усі вимоги', nl: 'Alle vereisten', tipUk: 'Повний список перевірок із результатом і тривалістю: видно, що вже гаразд.', tipNl: 'De volledige lijst met uitkomst en duur: zo is te zien wat al in orde is.' },
  { id: 'log', uk: 'Журнал', nl: 'Logboek', tipUk: 'Останні 80 рядків журналу перевірки з часом до мілісекунд.', tipNl: 'De laatste 80 regels van het logboek, tot op de milliseconde.' },
  { id: 'context', uk: 'Контекст', nl: 'Context', tipUk: 'Архів, версія, коміт, SHA-256, встановлена версія, браузер. Без паролів, токенів і пошти.', tipNl: 'Archief, versie, commit, SHA-256, geïnstalleerde versie, browser. Zonder wachtwoorden, tokens of mail.' },
];

export default function ProbleemRapport({ lang, invoer, onSluiten }: { lang: Lang; invoer: Omit<RapportInvoer, 'lang' | 'beschrijving' | 'delen'>; onSluiten: () => void }) {
  const [beschrijving, setBeschrijving] = useState('');
  const [delen, setDelen] = useState<RapportDelen>({ oorzaak: true, vereisten: true, log: true, context: true });
  const [gekopieerd, setGekopieerd] = useState(false);
  const venster = useRef<HTMLDivElement>(null);
  const r = useMemo(() => rapportTekst({ ...invoer, lang, beschrijving, delen }), [invoer, lang, beschrijving, delen]);

  useEffect(() => {
    const vorige = document.activeElement as HTMLElement | null;
    venster.current?.querySelector('textarea')?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onSluiten(); };
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('keydown', esc); vorige?.focus?.(); };
  }, [onSluiten]);

  const kopieer = async () => {
    const ok = await kopieerNaarKlembord(r.tekst);
    if (ok) { setGekopieerd(true); window.setTimeout(() => setGekopieerd(false), 1800); }
    emitCanonicalNotice({ kind: ok ? 'success' : 'warning', source: 'uitrol', dedupeSeconds: 10,
      text: ok ? tr(lang, 'Звіт про проблему скопійовано — вставте його агентові', 'Probleemrapport gekopieerd — plak het bij de agent') : tr(lang, 'Браузер не дав скопіювати — збережіть звіт як файл .md', 'De browser liet kopiëren niet toe — sla het rapport op als .md'),
      details: [{ title: tr(lang, 'Звіт', 'Rapport'), items: [{ icon: 'results', label: tr(lang, 'Розмір', 'Grootte'), value: `${r.tekst.length} ${tr(lang, 'знаків', 'tekens')}` }, { icon: 'saved', label: tr(lang, 'Приховано секретів', 'Geheimen verborgen'), value: String(r.gemaskeerd.length) }] }] });
  };
  const opslaan = () => bestandOpslaan(`probleem-${invoer.archief?.versie || 'uitrol'}.md`, r.tekst);

  return <div className='ut-vr-scrim' onClick={(e) => { if (e.target === e.currentTarget) onSluiten(); }}>
    <div className='ut-vr-modal' role='dialog' aria-modal='true' aria-labelledby='ut-vr-rapport-titel' ref={venster} data-ut-rapport>
      <header>
        <div><h3 id='ut-vr-rapport-titel'><FileText aria-hidden='true' />{tr(lang, 'Звіт про проблему', 'Probleemrapport')}</h3>
          <p>{tr(lang, 'Один текст для агента: ваш опис, причина, вимоги, журнал і контекст.', 'Eén tekst voor de agent: uw beschrijving, oorzaak, vereisten, logboek en context.')}</p></div>
        <button type='button' className='ut-vr-x' aria-label={tr(lang, 'Закрити', 'Sluiten')} onClick={onSluiten}><X aria-hidden='true' /></button>
      </header>
      <div className='ut-vr-modal-body'>
        <label className='ut-vr-lab' htmlFor='ut-vr-beschrijving'>{tr(lang, 'Що ви робили і що очікували (необов’язково)', 'Wat u deed en wat u verwachtte (optioneel)')}</label>
        <textarea id='ut-vr-beschrijving' rows={3} value={beschrijving} onChange={(e) => setBeschrijving(e.target.value)} placeholder={tr(lang, 'Наприклад: встановлював випуск через Admin → Оновлення…', 'Bijvoorbeeld: ik installeerde de release via Admin → Updates…')} />
        <span className='ut-vr-lab'>{tr(lang, 'Що включити', 'Wat meenemen')}</span>
        <div className='ut-vr-schakels'>{DELEN.map((d) => <label key={d.id} title={tr(lang, d.tipUk, d.tipNl)} data-aan={delen[d.id] || undefined}>
          <input type='checkbox' data-hulp-vrij='filter' checked={delen[d.id]} onChange={(e) => setDelen({ ...delen, [d.id]: e.target.checked })} />{tr(lang, d.uk, d.nl)}</label>)}</div>
        <span className='ut-vr-lab'>{tr(lang, 'Попередній перегляд', 'Voorbeeld')}</span>
        <pre className='ut-vr-voorbeeld' tabIndex={0}>{r.tekst}</pre>
      </div>
      <footer>
        <span className='ut-vr-schild'><ShieldCheck aria-hidden='true' />{r.gemaskeerd.length ? tr(lang, `Перевірено на секрети: приховано ${r.gemaskeerd.length}`, `Op geheimen gecontroleerd: ${r.gemaskeerd.length} verborgen`) : tr(lang, 'Перевірено на секрети: не знайдено', 'Op geheimen gecontroleerd: niets gevonden')}</span>
        <span className='ut-vr-acties'>
          <button type='button' className='ut-knop' onClick={opslaan}><Download aria-hidden='true' />{tr(lang, 'Зберегти .md', '.md opslaan')}</button>
          <button type='button' className='ut-knop ut-knop-primair' data-ut-rapport-kopieer onClick={() => void kopieer()}>{gekopieerd ? <Check aria-hidden='true' /> : <ClipboardCopy aria-hidden='true' />}{gekopieerd ? tr(lang, 'Скопійовано', 'Gekopieerd') : tr(lang, 'Скопіювати звіт', 'Rapport kopiëren')}</button>
        </span>
      </footer>
    </div>
  </div>;
}
