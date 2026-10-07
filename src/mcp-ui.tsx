import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, CircleHelp, Container, Globe, HardDrive, Laptop, Mail, Monitor, Puzzle, Search, Server, Github, Terminal, Calendar, Sparkles } from 'lucide-react';
import './mcp-hub.css';

export type Tr = (uk: string, nl: string) => string;

/** Onthoud per blok of het open of dicht is (alleen een gemak per kijker; werkt ook zonder opslag). */
function useRemembered(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  const storageKey = `mr.mcp.open.${key}`;
  const [open, setOpen] = useState<boolean>(() => {
    try { const saved = localStorage.getItem(storageKey); return saved === null ? initial : saved === '1'; } catch { return initial; }
  });
  const update = (value: boolean) => { setOpen(value); try { localStorage.setItem(storageKey, value ? '1' : '0'); } catch { /* geen opslag */ } };
  return [open, update];
}

/** Inklapbaar blok met pictogram, titel, ondertitel, teller en acties. De inhoud wordt pas gemaakt als het blok voor het eerst opengaat. */
export function Section({ id, icon, title, subtitle, badge, actions, defaultOpen = true, tone, children }: {
  id: string; icon: ReactNode; title: string; subtitle?: string; badge?: ReactNode; actions?: ReactNode; defaultOpen?: boolean;
  tone?: 'default' | 'warn' | 'danger' | 'ok'; children: ReactNode;
}) {
  const [open, setOpen] = useRemembered(id, defaultOpen);
  const [seen, setSeen] = useState(open);
  const bodyId = useId();
  useEffect(() => { if (open) setSeen(true); }, [open]);
  return (
    <section className={`hub-section${open ? ' is-open' : ''}${tone && tone !== 'default' ? ` tone-${tone}` : ''}`} data-hub-section={id}>
      <header className='hub-section-head'>
        <button type='button' className='hub-section-toggle' aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
          <span className='hub-section-icon' aria-hidden='true'>{icon}</span>
          <span className='hub-section-titles'>
            <b>{title}</b>
            {subtitle ? <small>{subtitle}</small> : null}
          </span>
          {badge ? <span className='hub-section-badge'>{badge}</span> : null}
          <ChevronDown className='hub-chevron' aria-hidden='true' />
        </button>
        {actions ? <div className='hub-section-actions'>{actions}</div> : null}
      </header>
      <div id={bodyId} className='hub-section-body' hidden={!open}>{seen ? children : null}</div>
    </section>
  );
}

export type HelpContent = { title: string; what: string; on?: string; off?: string; touches?: string; risk?: string };

/**
 * Hulpbalk bij een vraagteken: wat het is, waaraan het gekoppeld is en wat er gebeurt bij aan en uit. Opent bij aanwijzen, focus of tikken (ook op een telefoon).
 * De tekst herhaalt nooit de beschrijving ernaast: die staat al zichtbaar.
 */
export function Help({ tr, content, tone = 'info' }: { tr: Tr; content: HelpContent; tone?: 'info' | 'warn' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => { if (ref.current && event.target instanceof Node && !ref.current.contains(event.target)) setOpen(false); };
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <span ref={ref} className={`hub-help tone-${tone}`} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type='button' className='hub-help-btn' aria-expanded={open} aria-label={`${tr('Довідка', 'Uitleg')}: ${content.title}`}
        onClick={() => setOpen(!open)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
        {tone === 'warn' ? <span aria-hidden='true'>!</span> : <CircleHelp aria-hidden='true' />}
      </button>
      {open ? (
        <span className='hub-help-pop' role='tooltip'>
          <b>{content.title}</b>
          <span>{content.what}</span>
          {content.touches ? <span className='hub-help-row'><i>{tr('Стосується', 'Betreft')}</i>{content.touches}</span> : null}
          {content.on ? <span className='hub-help-row on'><i>{tr('Якщо ввімкнути', 'Als u aanzet')}</i>{content.on}</span> : null}
          {content.off ? <span className='hub-help-row off'><i>{tr('Якщо вимкнути', 'Als u uitzet')}</i>{content.off}</span> : null}
          {content.risk ? <span className='hub-help-row risk'><i>{tr('Ризик', 'Risico')}</i>{content.risk}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

export type LogoKind = 'windows' | 'linux' | 'macos' | 'chrome' | 'edge' | 'firefox' | 'browser' | 'docker' | 'google' | 'microsoft' | 'internal' | 'claude' | 'github' | 'device' | 'server' | 'search' | 'mail' | 'calendar';

/** Eenvoudige herkenbare merktekens (geen officiële bestanden; alleen vormen en kleuren) naast pictogrammen uit de bibliotheek. */
export function Logo({ kind, size = 28, label }: { kind: LogoKind; size?: number; label?: string }) {
  const common = { width: size, height: size, viewBox: '0 0 32 32', role: 'img' as const, 'aria-label': label || kind, className: `hub-logo hub-logo-${kind}` };
  switch (kind) {
    case 'windows': return <svg {...common}><path fill='#0a84d6' d='M4 7.2 14 5.8v9H4zM15.6 5.6 28 3.8v11H15.6zM4 16.4h10v9L4 24.6zM15.6 16.4H28v11.2L15.6 25.8z' /></svg>;
    case 'microsoft': return <svg {...common}><path fill='#f25022' d='M4 4h11.5v11.5H4z' /><path fill='#7fba00' d='M16.5 4H28v11.5H16.5z' /><path fill='#00a4ef' d='M4 16.5h11.5V28H4z' /><path fill='#ffb900' d='M16.5 16.5H28V28H16.5z' /></svg>;
    case 'google': return <svg {...common}><path fill='#4285f4' d='M28 16.3c0-.9-.1-1.7-.2-2.5H16v4.8h6.7a5.7 5.7 0 0 1-2.5 3.8v3.1h4c2.3-2.2 3.8-5.4 3.8-9.2z' /><path fill='#34a853' d='M16 28c3.4 0 6.2-1.1 8.3-3l-4-3.1c-1.1.7-2.5 1.2-4.3 1.2-3.3 0-6.1-2.2-7.1-5.2H4.8v3.2A12 12 0 0 0 16 28z' /><path fill='#fbbc05' d='M8.9 17.9a7.2 7.2 0 0 1 0-4.6V10H4.8a12 12 0 0 0 0 10.8z' /><path fill='#ea4335' d='M16 8.9c1.9 0 3.5.6 4.8 1.9l3.6-3.6A12 12 0 0 0 4.8 10l4.1 3.2c1-3 3.8-4.3 7.1-4.3z' /></svg>;
    case 'chrome': return <svg {...common}><circle cx='16' cy='16' r='12' fill='#ea4335' /><path fill='#34a853' d='M16 28A12 12 0 0 1 5.6 10l5.8 10.1z' /><path fill='#fbbc05' d='M16 28a12 12 0 0 0 10.4-18H14.8z' /><circle cx='16' cy='16' r='5' fill='#fff' /><circle cx='16' cy='16' r='3.6' fill='#4285f4' /></svg>;
    case 'edge': return <svg {...common}><path fill='#0a7ad6' d='M16 4a12 12 0 1 0 11.7 14.7H15.6c0-3 2.6-4.3 4.7-4.3 2.8 0 5 1.2 5 4h2.4C27.6 9.6 22.6 4 16 4z' /></svg>;
    case 'firefox': return <svg {...common}><circle cx='16' cy='17' r='11' fill='#ff7139' /><path fill='#ffbd4f' d='M10 9c2-3 8-4 12 0-3-.5-6 1-8 4z' /><circle cx='16' cy='17' r='5' fill='#6b2fbf' opacity='.75' /></svg>;
    case 'macos': return <svg {...common}><rect x='4' y='5' width='24' height='17' rx='3' fill='#6b7280' /><rect x='11' y='24' width='10' height='2.4' rx='1.2' fill='#6b7280' /><circle cx='16' cy='13.5' r='3.4' fill='#fff' /></svg>;
    case 'linux': return <svg {...common}><rect x='4' y='5' width='24' height='22' rx='4' fill='#1f2937' /><path d='m9 12 5 4-5 4' stroke='#4ade80' strokeWidth='2.4' fill='none' strokeLinecap='round' strokeLinejoin='round' /><path d='M16 21h7' stroke='#4ade80' strokeWidth='2.4' strokeLinecap='round' /></svg>;
    case 'docker': return <svg {...common}><path fill='#1d63ed' d='M3 15h24c.6-2.4-.8-3.6-2.2-4.2-.8 1-2.4 1.2-3.3.4V9h-3V6h-3v3h-3V6h-3v3H9v3H6v3H3zm1 2c.6 6.2 5.6 9 11.7 9 7 0 10.3-3.7 11.3-9z' /></svg>;
    case 'claude': return <svg {...common}><g fill='#d97757'><rect x='14.6' y='3' width='2.8' height='26' rx='1.4' /><rect x='14.6' y='3' width='2.8' height='26' rx='1.4' transform='rotate(60 16 16)' /><rect x='14.6' y='3' width='2.8' height='26' rx='1.4' transform='rotate(120 16 16)' /></g></svg>;
    case 'github': return <Github width={size} height={size} aria-label={label} className='hub-logo hub-logo-github' />;
    case 'internal': return <svg {...common}><rect x='4' y='4' width='24' height='24' rx='7' fill='#2f6f73' /><path d='M10 21V11l6 6 6-6v10' stroke='#fff' strokeWidth='2.4' fill='none' strokeLinecap='round' strokeLinejoin='round' /></svg>;
    case 'server': return <Server width={size} height={size} aria-label={label} className='hub-logo hub-logo-server' />;
    case 'search': return <Search width={size} height={size} aria-label={label} className='hub-logo hub-logo-search' />;
    case 'mail': return <Mail width={size} height={size} aria-label={label} className='hub-logo hub-logo-mail' />;
    case 'calendar': return <Calendar width={size} height={size} aria-label={label} className='hub-logo hub-logo-calendar' />;
    case 'browser': return <Globe width={size} height={size} aria-label={label} className='hub-logo hub-logo-browser' />;
    default: return <Monitor width={size} height={size} aria-label={label} className='hub-logo hub-logo-device' />;
  }
}

/** Welk merkteken bij een agent hoort: het besturingssysteem van de pc, of de browser van de extensie. */
export function agentLogo(agent: { platform: string | null; name?: string }): LogoKind {
  const p = (agent.platform || '').toLowerCase();
  const n = (agent.name || '').toLowerCase();
  if (p === 'browser') {
    if (/edge/.test(n)) return 'edge';
    if (/firefox/.test(n)) return 'firefox';
    if (/chrom|brave|opera|vivaldi/.test(n)) return 'chrome';
    return 'chrome';
  }
  if (/win/.test(p)) return 'windows';
  if (/darwin|mac/.test(p)) return 'macos';
  if (/linux|ubuntu|debian/.test(p)) return 'linux';
  return 'device';
}

export function StatusDot({ state, label }: { state: 'on' | 'wait' | 'off' | 'bad'; label: string }) {
  return <span className={`hub-dot hub-dot-${state}`} role='img' aria-label={label} title={label} />;
}

/** Soort kleine knop met pictogram en tekst (de tekst blijft zichtbaar; op een smal scherm verdwijnt alleen de ruimte). */
export function IconButton({ icon, children, onClick, disabled, tone = 'default', title, type = 'button' }: {
  icon: ReactNode; children: ReactNode; onClick?: () => void; disabled?: boolean; tone?: 'default' | 'primary' | 'danger'; title?: string; type?: 'button' | 'submit';
}) {
  return (
    <button type={type} className={`hub-btn tone-${tone}`} onClick={onClick} disabled={disabled} title={title}>
      <span className='hub-btn-icon' aria-hidden='true'>{icon}</span>
      <span>{children}</span>
    </button>
  );
}

export const icons = { Container, HardDrive, Laptop, Puzzle, Terminal, Github, Sparkles };
