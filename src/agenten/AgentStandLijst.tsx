// De WARE stand per AI-agent, alleen-lezen (20.10.2026) — voor admin → Доступ ШІ (en elke andere plek die alleen wil TONEN).
// Bron: backend/connector-v2.ts → agentStanden, dezelfde regel als de hub (shared/connector-v2/stand.ts): v2-koppelingen, de erfenis
// van het oude /mcp en de serverdeur tellen alle drie; de levende kant en het aantal hulpmiddelen komen van de server. Instellen
// gebeurt NIET hier: elke rij linkt naar de plek van die ene AI in de hub (#agent/<slug>), zodat er maar één plek is.
import { ExternalLink, Link2, Wrench, UserRound } from 'lucide-react';
import { standVan } from '../../shared/connector-v2/stand';
import { KANT_TEKST, type Kant } from '../../shared/connector-v2/catalogus';
import type { AgentSlug } from '../../shared/connector-v2/agenten';
import AgentLogo from './AgentLogo';

export type AgentStandKort = {
  slug: AgentSlug; naam: string; url: string;
  v2: number; erfenis: number; deur: number | null; wacht: boolean;
  kanten: Kant[]; levend: Kant[]; hulpmiddelen: number; laatst: number | null;
};
export type PoortKort = { ruimte: 'prive' | 'technisch'; stand: string; code: string | null };
type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);

const sinds = (lang: Lang, ms: number | null, nu: number) => {
  if (!ms) return tr(lang, 'ще не користувався', 'nog niet gebruikt');
  const m = Math.floor(Math.max(0, nu - ms) / 60_000);
  if (m < 1) return tr(lang, 'щойно', 'zojuist');
  if (m < 60) return tr(lang, `${m} хв тому`, `${m} min geleden`);
  const h = Math.floor(m / 60);
  if (h < 48) return tr(lang, `${h} год тому`, `${h} uur geleden`);
  return tr(lang, `${Math.floor(h / 24)} дн. тому`, `${Math.floor(h / 24)} dgn geleden`);
};

export default function AgentStandLijst({ lang, stand, nu, naarAgent }: { lang: Lang; stand: { agenten: AgentStandKort[]; poort: PoortKort } | null; nu: number; naarAgent: (slug: AgentSlug) => string }) {
  const kantNaam = (k: Kant) => KANT_TEKST[k][lang];
  return (
    <section className='aiz-stand' data-aiz-agent-stand={stand ? stand.agenten.length : 'onbekend'} aria-label={tr(lang, 'Стан підключення ШІ', 'Stand van de AI-koppelingen')}>
      <div className='aiz-stand-kop'>
        <h3><Link2 aria-hidden='true' />{tr(lang, 'Підключені ШІ зараз', 'Verbonden AI nu')}</h3>
        <small>{stand
          ? tr(lang, `Технічна сторона зараз ${stand.poort.ruimte === 'technisch' ? 'діє' : 'не діє'} (${stand.poort.stand}${stand.poort.code ? `, ${stand.poort.code}` : ''}). Це живий стан, та сама правда, що в хабі «Підключення ШІ».`, `De technische kant is nu ${stand.poort.ruimte === 'technisch' ? 'actief' : 'niet actief'} (${stand.poort.stand}${stand.poort.code ? `, ${stand.poort.code}` : ''}). Dit is de levende stand, dezelfde waarheid als in de hub «AI-koppelingen».`)
          : tr(lang, 'Стан підключень зараз невідомий — сервер не зміг його визначити.', 'De stand van de koppelingen is nu onbekend — de server kon hem niet bepalen.')}</small>
      </div>
      {stand ? (
        <ul className='aiz-stand-lijst'>
          {stand.agenten.map((a) => {
            const w = standVan({ v2: a.v2, erfenis: a.erfenis, deur: a.deur, wacht: a.wacht });
            return (
              <li key={a.slug} className={`aiz-stand-rij is-${w.code}`} data-aiz-stand={a.slug} data-aiz-stand-code={w.code}>
                <AgentLogo agent={a.slug} naam={a.naam} size={30} />
                <span className='aiz-stand-naam'><strong>{a.naam}</strong><code>/{a.slug}</code></span>
                <span className={`aiz-stand-tekst is-${w.code}`}>{tr(lang, w.uk, w.nl)}</span>
                <span className='aiz-stand-meta'>
                  <span>{a.kanten.length ? a.kanten.map((k) => <span key={k} className={`v2-kant-teller kant-${k}${a.levend.includes(k) ? '' : ' is-slapend'}`} title={a.levend.includes(k) ? tr(lang, 'діє зараз', 'nu actief') : tr(lang, 'дозволено, зараз не діє', 'toegestaan, nu niet actief')}>{k === 'beheer' ? <Wrench size={12} /> : <UserRound size={12} />}{kantNaam(k)}</span>) : <span className='aiz-zacht'>{tr(lang, 'дозволи ще не обрано', 'nog geen rechten gekozen')}</span>}</span>
                  <span>{tr(lang, `інструментів зараз: ${a.hulpmiddelen}`, `hulpmiddelen nu: ${a.hulpmiddelen}`)}</span>
                  <span>{tr(lang, 'остання дія: ', 'laatste actie: ')}{sinds(lang, a.laatst, nu)}</span>
                </span>
                <a className='aiz-link' href={naarAgent(a.slug)} data-aiz-naar-agent={a.slug}>{w.verbonden ? tr(lang, 'Керувати', 'Beheren') : tr(lang, 'Підключити', 'Koppelen')}<ExternalLink aria-hidden='true' /></a>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
