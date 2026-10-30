// Bouwstenen voor /agents in de stijl van GitHub Settings → Applications: rijen die standaard dicht zijn (titel, statusregel,
// knop rechts), uitklappen voor alle technische gegevens, acties met bevestiging op de pagina, spinner en een duidelijke uitkomst.
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Loader2, TriangleAlert, X } from 'lucide-react';
import type { Tr } from '../mcp-ui';
import { foutTekst } from './fouten';

const fmt = () => new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
export const exact = (ms: number | null | undefined) => { if (!ms) return '—'; try { return fmt().format(new Date(ms)); } catch { return new Date(ms).toISOString(); } };
export const datum = (ms: number | null | undefined) => { if (!ms) return '—'; try { return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ms)); } catch { return new Date(ms).toISOString().slice(0, 10); } };

/** «5 хв тому» / «через 3 дн.»; zonder waarde «—». */
export function relatief(ms: number | null | undefined, tr: Tr, nu = Date.now()): string {
  if (!ms) return '—';
  const d = ms - nu, a = Math.abs(d), toekomst = d > 0;
  const s = Math.round(a / 1000), m = Math.round(s / 60), h = Math.round(m / 60), dg = Math.round(h / 24);
  const [uk, nl] = s < 45 ? ['щойно', 'zojuist'] : m < 60 ? [`${m} хв`, `${m} min`] : h < 36 ? [`${h} год`, `${h} uur`] : dg < 60 ? [`${dg} дн.`, `${dg} dagen`] : [`${Math.round(dg / 30)} міс.`, `${Math.round(dg / 30)} mnd.`];
  if (s < 45) return tr(uk, nl);
  return toekomst ? tr(`через ${uk}`, `over ${nl}`) : tr(`${uk} тому`, `${nl} geleden`);
}
/** Relatieve tijd met de exacte tijd (met zone) bij aanwijzen. */
export function Tijd({ ms, tr }: { ms: number | null | undefined; tr: Tr }) {
  const [, tik] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tik((n) => n + 1), 30000); return () => window.clearInterval(t); }, []);
  if (!ms) return <span className='ag-tijd'>—</span>;
  return <time className='ag-tijd' dateTime={new Date(ms).toISOString()} title={exact(ms)}>{relatief(ms, tr)}</time>;
}

/** GitHub-achtig: «Використано протягом останнього тижня». */
export function gebruiktBinnen(ms: number | null | undefined, tr: Tr): string {
  if (!ms) return tr('Ще не використовувався', 'Nog nooit gebruikt');
  const dagen = (Date.now() - ms) / 86_400_000;
  if (dagen < 1) return tr('Використано сьогодні', 'Vandaag gebruikt');
  if (dagen < 7) return tr('Використано протягом останнього тижня', 'Gebruikt in de afgelopen week');
  if (dagen < 31) return tr('Використано протягом останнього місяця', 'Gebruikt in de afgelopen maand');
  return tr('Не використовувався понад місяць', 'Meer dan een maand niet gebruikt');
}

export type Toon = 'ok' | 'warn' | 'bad' | 'off' | 'info';
export function Badge({ toon, children, data }: { toon: Toon; children: ReactNode; data?: string }) {
  return <span className={`ag-badge ag-${toon}`} data-badge={data}>{children}</span>;
}

/** Eén rij: dicht = logo, titel, badges, één statusregel en de knop(pen) rechts; open = details. */
export function Rij({ id, logo, titel, badges, status, acties, children, open, onToggle, gedimd, data }: {
  id: string; logo: ReactNode; titel: ReactNode; badges?: ReactNode; status: ReactNode; acties?: ReactNode; children?: ReactNode;
  open: boolean; onToggle: () => void; gedimd?: boolean; data?: Record<string, string>;
}) {
  const body = useId();
  return (
    <li className={`ag-rij${open ? ' is-open' : ''}${gedimd ? ' is-gedimd' : ''}`} data-rij={id} {...Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-${k}`, v]))}>
      <div className='ag-rij-kop'>
        <button type='button' className='ag-rij-toggle' aria-expanded={open} aria-controls={body} onClick={onToggle}>
          <span className='ag-rij-logo' aria-hidden='true'>{logo}</span>
          <span className='ag-rij-tekst'>
            <span className='ag-rij-titel'><b>{titel}</b>{badges}</span>
            <small className='ag-rij-status'>{status}</small>
          </span>
          <ChevronDown className='ag-chevron' aria-hidden='true' />
        </button>
        {acties ? <div className='ag-rij-acties'>{acties}</div> : null}
      </div>
      {open ? <div id={body} className='ag-rij-details'>{children}</div> : null}
    </li>
  );
}

/** Technische gegevens als nette tabel met twee kolommen (waarden in monospace, selecteerbaar). */
export function Tech({ rijen }: { rijen: Array<[string, ReactNode] | null | false | undefined> }) {
  return (
    <dl className='ag-tech'>
      {rijen.filter(Boolean).map((r) => { const [k, v] = r as [string, ReactNode]; return <div key={k} className='ag-tech-rij'><dt>{k}</dt><dd>{v ?? '—'}</dd></div>; })}
    </dl>
  );
}

export type Uitkomst = { soort: 'ok' | 'fout'; tekst: string; at: number } | null;
/** Uitkomst van een actie: groen of rood, met wat er veranderde. Live regio, sluitbaar. */
export function Melding({ uitkomst, tr, onSluit }: { uitkomst: Uitkomst; tr: Tr; onSluit: () => void }) {
  if (!uitkomst) return null;
  return (
    <div className={`ag-melding ag-melding-${uitkomst.soort}`} role={uitkomst.soort === 'fout' ? 'alert' : 'status'} data-ag-melding={uitkomst.soort}>
      {uitkomst.soort === 'ok' ? <Check aria-hidden='true' /> : <TriangleAlert aria-hidden='true' />}
      <span>{uitkomst.tekst}</span>
      <button type='button' className='ag-melding-x' aria-label={tr('Закрити', 'Sluiten')} onClick={onSluit}><X aria-hidden='true' /></button>
    </div>
  );
}

/** Eén actie-afhandeling per lijst: bezig (spinner), bevestiging op de pagina en de uitkomst. */
export function useActies(tr: Tr) {
  const [bezig, setBezig] = useState('');
  const [bevestig, setBevestig] = useState('');
  const [uitkomst, setUitkomst] = useState<Uitkomst>(null);
  const voerUit = async (sleutel: string, taak: () => Promise<string>, wat: [string, string]) => {
    setBezig(sleutel); setBevestig(''); setUitkomst(null);
    try { const tekst = await taak(); setUitkomst({ soort: 'ok', tekst, at: Date.now() }); return true; }
    catch (e) { setUitkomst({ soort: 'fout', tekst: foutTekst(e, tr, wat), at: Date.now() }); return false; }
    finally { setBezig(''); }
  };
  return { bezig, bevestig, setBevestig, uitkomst, setUitkomst, voerUit };
}

export function Knop({ children, onClick, toon = 'default', bezig, disabled, icoon, title, type = 'button', data }: {
  children: ReactNode; onClick?: () => void; toon?: 'default' | 'primary' | 'danger'; bezig?: boolean; disabled?: boolean; icoon?: ReactNode; title?: string; type?: 'button' | 'submit'; data?: string;
}) {
  return (
    <button type={type} className={`ag-knop ag-knop-${toon}`} onClick={onClick} disabled={disabled || bezig} aria-busy={bezig || undefined} title={title} data-knop={data}>
      {bezig ? <Loader2 className='ag-spin' aria-hidden='true' /> : icoon ? <span className='ag-knop-icoon' aria-hidden='true'>{icoon}</span> : null}
      <span>{children}</span>
    </button>
  );
}

/** Knop met bevestiging op de pagina (geen window.confirm): eerst de knop, dan «Так, …» / «Скасувати» met uitleg wat er gebeurt. */
export function GevaarKnop({ tr, sleutel, label, vraag, ja, acties, onJa, icoon, klein }: {
  tr: Tr; sleutel: string; label: string; vraag: string; ja: string; acties: ReturnType<typeof useActies>; onJa: () => void; icoon?: ReactNode; klein?: boolean;
}) {
  const open = acties.bevestig === sleutel;
  if (!open) return <Knop toon='danger' icoon={icoon} bezig={acties.bezig === sleutel} disabled={!!acties.bezig && acties.bezig !== sleutel} onClick={() => acties.setBevestig(sleutel)} data={`${sleutel}`}>{label}</Knop>;
  return (
    <span className={`ag-bevestig${klein ? ' is-klein' : ''}`} role='group' aria-label={vraag} data-bevestig={sleutel}>
      <span className='ag-bevestig-vraag'>{vraag}</span>
      <Knop toon='danger' onClick={onJa} data={`${sleutel}:ja`}>{ja}</Knop>
      <Knop onClick={() => acties.setBevestig('')} data={`${sleutel}:nee`}>{tr('Скасувати', 'Annuleren')}</Knop>
    </span>
  );
}

/** Samengeklapte groep (bijv. «Відкликані»): blijft zichtbaar als geschiedenis, met datum per rij. */
export function Groep({ titel, aantal, children, data, acties }: { titel: string; aantal: number; children: ReactNode; data?: string; /** knoppen boven de lijst (bv. opruimen) */ acties?: ReactNode }) {
  if (!aantal) return null;
  return (
    <details className='ag-groep' data-groep={data}>
      <summary><ChevronDown className='ag-chevron' aria-hidden='true' /><span>{titel}</span><span className='ag-teller'>{aantal}</span></summary>
      {acties ? <div className='ag-groep-acties'>{acties}</div> : null}
      <ul className='ag-lijst'>{children}</ul>
    </details>
  );
}

/** Gesegmenteerde keuze (bijv. sorteren of presets). */
export function Segment<T extends string>({ waarde, opties, onKies, label, disabled }: { waarde: T | ''; opties: Array<{ id: T; label: ReactNode; uitleg?: ReactNode }>; onKies: (id: T) => void; label: string; disabled?: boolean }) {
  return (
    <div className='ag-segment' role='radiogroup' aria-label={label}>
      {opties.map((o) => (
        <span key={o.id} className='ag-segment-optie'>
          <button type='button' role='radio' aria-checked={waarde === o.id} disabled={disabled} onClick={() => onKies(o.id)} data-segment={o.id}>{o.label}</button>
          {o.uitleg}
        </span>
      ))}
    </div>
  );
}
