// Gedeelde toestanden van elke widget: skelet (laden), leeg, fout (met de code van de server), «niet gekoppeld → koppelen»
// (met de JUISTE knop naar de instellingen) en de gesloten lade (0086). Nooit een nagemaakt lijstje in de plaats van werk.
import { AlertCircle, Link2, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { RuimteGeslotenVlak } from '../../RuimteStrook';
import type { HubBlockDataSource } from '../../hub-blok-gegevens';
import { tr, type Acties, type Lang } from '../soorten';

export const Skelet = ({ rijen = 3 }: { rijen?: number }) => (
  <div className='wb-skelet' aria-hidden='true'>{Array.from({ length: rijen }, (_, i) => <span key={i} style={{ width: `${88 - (i % 3) * 14}%` }} />)}</div>
);
export const Leeg = ({ children, icoon }: { children: ReactNode; icoon?: ReactNode }) => <p className='wb-leeg'>{icoon}<span>{children}</span></p>;
export const Fout = ({ lang, code, opnieuw }: { lang: Lang; code: string; opnieuw?: () => void }) => (
  <p className='wb-fout' role='alert'><AlertCircle aria-hidden='true' />
    <span>{/^(OWNER_|MCP_|ACCOUNT_|WERKBLAD_|ZOEK_)/.test(code) || /401|403/.test(code)
      ? tr(lang, 'Ці дані доступні лише після входу у ваш акаунт.', 'Deze gegevens zijn alleen beschikbaar na aanmelden in uw account.')
      : tr(lang, `Не вдалося завантажити дані (${code}).`, `Gegevens laden mislukt (${code}).`)}</span>
    {opnieuw ? <button type='button' className='knop-stil is-klein' onClick={opnieuw}><RefreshCw aria-hidden='true' />{tr(lang, 'Ще раз', 'Opnieuw')}</button> : null}
  </p>
);

/** «Не підключено → Підключити»: de knop opent precies de pagina waar het koppelen gebeurt. */
export function NietGekoppeld({ lang, soort, acties }: { lang: Lang; soort: 'mail' | 'files' | 'calendar' | 'github'; acties: Acties }) {
  const tekst = soort === 'calendar' ? tr(lang, 'Календар не підключено.', 'De agenda is niet gekoppeld.')
    : soort === 'mail' ? tr(lang, 'Пошту не підключено.', 'E-mail is niet gekoppeld.')
      : soort === 'github' ? tr(lang, 'GitHub не підключено.', 'GitHub is niet gekoppeld.')
        : tr(lang, 'Хмарне сховище не підключено.', 'Cloudopslag is niet gekoppeld.');
  const open = () => (soort === 'calendar' ? acties.hubTab('calendar') : soort === 'mail' ? acties.dienst('mail', 'accounts') : soort === 'github' ? acties.dienst('github', 'accounts') : acties.dienst('cloud', 'accounts'));
  return (
    <div className='wb-niet-gekoppeld' data-wb-niet-gekoppeld={soort}>
      <Link2 aria-hidden='true' />
      <span>{tekst}</span>
      <button type='button' className='knop-primair is-klein' onClick={open}>{tr(lang, 'Підключити', 'Koppelen')}</button>
    </div>
  );
}

/** Eén plek voor de drie toestanden van een hub/blocks/data-bron (gesloten lade, niet gekoppeld, leeg). null = er zijn items. */
export function BronToestand({ lang, bron, soort, acties, leeg }: { lang: Lang; bron: HubBlockDataSource; soort: 'mail' | 'files' | 'calendar'; acties: Acties; leeg: string }) {
  if (bron.status === 'gesloten' && bron.gesloten) return <div className='wb-leeg-vlak' data-wb-gesloten={soort}><RuimteGeslotenVlak gesloten={{ code: bron.gesloten.code as never, dienst: bron.gesloten.dienst as never, dienstNaam: bron.gesloten.dienstNaam, uitleg: bron.gesloten.uitleg }} lang={lang} /></div>;
  if (bron.status === 'empty' && bron.gekoppeld === false) return <NietGekoppeld lang={lang} soort={soort} acties={acties} />;
  if (!bron.items.length) return <Leeg>{leeg}</Leeg>;
  return null;
}
