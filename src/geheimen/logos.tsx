// Kleine, lichte logo's (alleen CSS + tekst, geen afbeeldingen) voor diensten en groepen in «Секрети й ключі».
import { Bot, Cloud, CreditCard, Database, KeyRound, Lock, Mail, Server, Shield } from 'lucide-react';
import type { ComponentType } from 'react';
import Logo from '../merk/MerkLogo';
import { DIENSTEN, type DienstId, type GeheimGroep } from '../../shared/geheimen';

export const GROEP_ICOON: Record<GeheimGroep, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  google: Shield, site: Shield, server: Server, database: Database, oauth: KeyRound, ai: Bot, mail: Mail, betaling: CreditCard, cloud: Cloud, eigen: Lock,
};

/**
 * Logo van een dienst uit het ENE merkregister (src/merk): echte merken met hun eigen teken, wat geen merk is (SSH, SMTP, SCIM,
 * API-tokens, audit, versleuteling …) met een categorie-icoon. Was: letters op een merkkleur («G», «GH», «HA», «CF», «>_»), wit
 * op lichtblauw/oranje = 2,3–3,0:1 en voor merken die wél een logo hebben een pseudo-logo (contrastronde 21.10.2026).
 */
export const DIENST_MERK: Record<DienstId, string> = {
  google: 'google', microsoft: 'microsoft', github: 'github', anthropic: 'anthropic', openai: 'gpt',
  gemini: 'gemini', grok: 'grok', autoclaw: 'autoclaw', telegram: 'telegram',
  'home-assistant': 'homeassistant', webhook: 'webhook', postgres: 'postgresql', ssh: 'icoon-terminal', cloudflare: 'cloudflare',
  stripe: 'stripe', smtp: 'icoon-mail', scim: 'icoon-scim', site: 'internal', audit: 'icoon-journaal', versleuteling: 'icoon-slot',
  mcp: 'icoon-bot', api: 'icoon-api', overig: 'icoon-sleutel',
};

export function DienstLogo({ dienst, grootte = 40, titel }: { dienst: DienstId; grootte?: number; titel?: string }) {
  const d = DIENSTEN[dienst] ?? DIENSTEN.overig;
  return (
    <span className='gm-logo is-merk' data-dienst={dienst} role={titel ? 'img' : undefined} aria-label={titel} aria-hidden={titel ? undefined : true}
      style={{ width: grootte, height: grootte }}>
      <Logo id={dienst} naam={d.naam[0]} logo={DIENST_MERK[dienst] ?? 'icoon-sleutel'} maat={grootte} />
    </span>
  );
}
