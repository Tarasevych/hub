import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, CircleHelp, Container, KeyRound, Globe, HardDrive, Laptop, Mail, Monitor, Puzzle, Search, Server, Github, Terminal, Calendar, Sparkles } from 'lucide-react';
import Merk from './merk/Merk';
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

export type HelpContent = { title: string; what?: string; on?: string; off?: string; touches?: string; risk?: string };

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
          {content.what ? <span>{content.what}</span> : null}
          {content.touches ? <span className='hub-help-row'><i>{tr('Стосується', 'Betreft')}</i>{content.touches}</span> : null}
          {content.on ? <span className='hub-help-row on'><i>{tr('Якщо ввімкнути', 'Als u aanzet')}</i>{content.on}</span> : null}
          {content.off ? <span className='hub-help-row off'><i>{tr('Якщо вимкнути', 'Als u uitzet')}</i>{content.off}</span> : null}
          {content.risk ? <span className='hub-help-row risk'><i>{tr('Ризик', 'Risico')}</i>{content.risk}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

export type LogoKind = 'windows' | 'linux' | 'macos' | 'chrome' | 'edge' | 'firefox' | 'opera' | 'brave' | 'vivaldi' | 'safari' | 'node' | 'browser' | 'docker' | 'google' | 'microsoft' | 'internal' | 'claude' | 'github' | 'device' | 'server' | 'search' | 'mail' | 'calendar' | 'grok' | 'cursor' | 'gemini' | 'copilot' | 'antigravity' | 'autoclaw' | 'codex' | 'openai' | 'aiclient' | 'key';

// Welke `kind` een echt merk is. De vormen staan NIET meer hier: ze komen uit het ene merkregister van de site
// (src/merk/merk-tabel.ts), zodat Claude, ChatGPT, Chrome, Apple of Docker op elke pagina hetzelfde teken krijgt. Eerder stond
// hier een eigen set van 21 gliefjes die dezelfde merken nóg een keer tekende — en wel in de hoofdbundel.
const MERK_TEGEL = new Set<string>(['claude', 'grok', 'cursor', 'gemini', 'copilot', 'antigravity', 'autoclaw', 'codex', 'openai', 'internal']);
const MERK_GLIEFJE = new Set<string>(['windows', 'microsoft', 'google', 'chrome', 'edge', 'firefox', 'opera', 'brave', 'vivaldi', 'safari', 'node', 'macos', 'linux', 'docker', 'github']);

/** Merkteken of pictogram, altijd op dezelfde maat. Merken komen uit src/merk/, de rest uit de pictogrammenbibliotheek. */
export function Logo({ kind, size = 28, label }: { kind: LogoKind; size?: number; label?: string }) {
  const tegel = MERK_TEGEL.has(kind);
  if (tegel || MERK_GLIEFJE.has(kind))
    return <Merk merk={kind} naam={label || kind} maat={size} titel={label || kind} vorm={tegel ? 'tegel' : 'gliefje'} className={`hub-logo hub-logo-${kind}`} />;
  const p = { width: size, height: size, 'aria-label': label };
  switch (kind) {
    case 'aiclient': return <Sparkles {...p} className='hub-logo hub-logo-aiclient' />;
    case 'key': return <KeyRound {...p} className='hub-logo hub-logo-key' />;
    case 'server': return <Server {...p} className='hub-logo hub-logo-server' />;
    case 'search': return <Search {...p} className='hub-logo hub-logo-search' />;
    case 'mail': return <Mail {...p} className='hub-logo hub-logo-mail' />;
    case 'calendar': return <Calendar {...p} className='hub-logo hub-logo-calendar' />;
    case 'browser': return <Globe {...p} className='hub-logo hub-logo-browser' />;
    default: return <Monitor {...p} className='hub-logo hub-logo-device' />;
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
