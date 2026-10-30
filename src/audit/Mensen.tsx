// Avatars en namen in het beheerlogboek: persoon (foto of monogram), AI-agent (merklogo via AgentLogo van src/agenten) en «doel».
import { Bot, KeyRound, Package, Shield, SlidersHorizontal, UserRound, MonitorSmartphone, Fingerprint, Wrench } from 'lucide-react';
import AgentLogo, { agentSlugVan } from '../agenten/AgentLogo';
import type { Doel } from '../../shared/beheer-journaal';
import type { Persoon } from './types';

const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

export function PersoonAvatar({ p, id, maat = 28 }: { p?: Persoon; id?: string | null; maat?: number }) {
  const naam = p?.naam || p?.email || id || '?';
  if (p?.foto) return <img className='aj-av' src={p.foto} alt='' width={maat} height={maat} loading='lazy' decoding='async' referrerPolicy='no-referrer' style={{ width: maat, height: maat }} />;
  const h = hue(p?.id || id || naam);
  return <span className='aj-av aj-av-mono' aria-hidden='true' style={{ width: maat, height: maat, fontSize: maat * 0.44, background: `linear-gradient(140deg,hsl(${h} 58% 30%),hsl(${(h + 50) % 360} 62% 26%))` }}>{[...String(naam).trim()][0]?.toUpperCase() || '?'}</span>;
}

/** Naam van een persoon: eerst naam, dan e-mail; onbekend id → «систему» (geen id's tonen aan de gebruiker). */
export const persoonNaam = (p: Persoon | undefined, id: string | null | undefined, systeem: string) => p?.naam || p?.email || (id ? `${id.slice(0, 8)}…` : systeem);

export function Wie({ id, personen, agent, systeem, lang }: { id: string | null; personen: Record<string, Persoon>; agent: string; systeem: string; lang: 'uk' | 'nl' }) {
  const p = id ? personen[id] : undefined;
  const slug = agentSlugVan(agent);
  return <span className='aj-wie'>
    <span className='aj-wie-av'>
      {id ? <PersoonAvatar p={p} id={id} /> : <span className='aj-av aj-av-sys' aria-hidden='true'><Shield size={15} /></span>}
      {slug ? <span className='aj-wie-agent' title={lang === 'uk' ? 'Через ШІ-агента' : 'Via AI-agent'}><AgentLogo agent={agent} size={16} /></span> : null}
    </span>
    <span className='aj-wie-tekst'>
      <b>{persoonNaam(p, id, systeem)}</b>
      {p?.naam && p.email ? <small>{p.email}</small> : null}
    </span>
  </span>;
}

const SOORT_ICOON: Record<string, typeof Bot> = { agent: Bot, account: UserRound, tool: Wrench, schakelaar: SlidersHorizontal, pakket: Package, toestemming: KeyRound, verbinding: KeyRound, deur: KeyRound, rol: Shield, passkey: Fingerprint, apparaat: MonitorSmartphone };
export function Doelwit({ doel, personen, agent }: { doel: Doel | null; personen: Record<string, Persoon>; agent: string }) {
  if (!doel) return <span className='aj-leeg'>—</span>;
  const p = doel.id ? personen[doel.id] : undefined;
  const slug = doel.soort === 'agent' ? agentSlugVan(doel.naam || doel.id || agent) : null;
  if (slug) return <span className='aj-doel'><AgentLogo agent={slug} size={22} /><b>{doel.naam || doel.id}</b></span>;
  if (p) return <span className='aj-doel'><PersoonAvatar p={p} id={doel.id} maat={22} /><b>{p.naam || p.email}</b></span>;
  const Icoon = SOORT_ICOON[doel.soort] || SlidersHorizontal;
  return <span className='aj-doel'><span className='aj-doel-ico' aria-hidden='true'><Icoon size={13} /></span><b>{doel.naam || doel.id || doel.soort}</b></span>;
}
