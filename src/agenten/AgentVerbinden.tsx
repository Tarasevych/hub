// «Підключити <ШІ>» — het blok bovenaan de pagina van één agent (20.10.2026): ÉÉN grote knop (de weg die de maker echt heeft),
// het eigen adres met kopieerknop, de stappen voor juist deze client en — eerlijk — de grens waar de maker geen eigen MCP-server
// toelaat. Het recept komt uit src/agenten/verbind-recepten.ts (puur); hier staat alleen de weergave.
import { useState } from 'react';
import { Check, ClipboardCopy, Copy, ExternalLink, Info, Plug, TriangleAlert } from 'lucide-react';
import { agentUrl, v2Agent, type AgentSlug } from '../../shared/connector-v2/agenten';
import type { Tr } from '../mcp-ui';
import { recept, type ReceptKnop } from './verbind-recepten';
import { Knop } from './ui';

function useKopieer() {
  const [welke, setWelke] = useState('');
  const kopieer = (sleutel: string, tekst: string) => { void navigator.clipboard?.writeText(tekst).then(() => { setWelke(sleutel); window.setTimeout(() => setWelke(''), 1800); }).catch(() => undefined); };
  return { welke, kopieer };
}

export default function AgentVerbinden({ tr, slug }: { tr: Tr; slug: AgentSlug }) {
  const uk = tr('uk', 'nl') === 'uk';
  const t = (p: readonly [string, string]) => (uk ? p[0] : p[1]);
  const info = v2Agent(slug);
  const r = recept(slug);
  const adres = agentUrl(slug);
  const { welke, kopieer } = useKopieer();

  const knop = (k: ReceptKnop, i: number) => {
    const hoofd = i === 0;
    const sleutel = `knop-${i}`;
    const cls = `ag-knop ${hoofd ? 'ag-knop-primary ag-verbind-groot' : 'ag-knop-default'}`;
    if (k.soort === 'deeplink' || k.soort === 'web') {
      // Een deeplink (cursor://, vscode:) opent de app; een webadres opent in een nieuw tabblad. Beide zonder JavaScript-omweg.
      const web = k.soort === 'web';
      return <a key={sleutel} className={cls} href={k.href} target={web ? '_blank' : undefined} rel={web ? 'noopener noreferrer' : undefined} data-verbind-knop={k.soort} data-verbind-hoofd={hoofd ? '1' : '0'}>
        <span className='ag-knop-icoon' aria-hidden='true'>{web ? <ExternalLink /> : <Plug />}</span><span>{t(k.label)}</span>
      </a>;
    }
    return <Knop key={sleutel} toon={hoofd ? 'primary' : 'default'} icoon={welke === sleutel ? <Check /> : <ClipboardCopy />} data={`verbind-${k.soort}`} onClick={() => kopieer(sleutel, k.kopieer ?? '')}>
      {welke === sleutel ? tr('Скопійовано', 'Gekopieerd') : t(k.label)}
    </Knop>;
  };

  return (
    <div className='ag-verbind-agent' data-agent-verbinden={slug} data-een-klik={r.knoppen.some((k) => k.soort === 'deeplink' || k.soort === 'opdracht') ? '1' : '0'}>
      <div className='ag-verbind-knoppen'>
        {r.knoppen.map(knop)}
      </div>
      {r.knoppen.map((k, i) => k.uitleg ? <p key={`u-${i}`} className='hub-meta ag-verbind-knop-uitleg'>{t(k.uitleg)}</p> : null)}
      <p className='ag-agent-adres' data-agent-adres-rij='1'>
        <span className='hub-meta'>{tr(`Адреса конектора для ${info.naam}:`, `Connectoradres voor ${info.naam}:`)}</span>
        <code data-verbind-adres={slug}>{adres}</code>
        <Knop icoon={welke === 'adres' ? <Check /> : <Copy />} data='agent-adres-kopieer' onClick={() => kopieer('adres', adres)}>{welke === 'adres' ? tr('Скопійовано', 'Gekopieerd') : tr('Скопіювати адресу', 'Adres kopiëren')}</Knop>
      </p>
      {r.vereist ? <p className='hub-meta ag-verbind-vereist' data-verbind-vereist='1'><Info size={14} aria-hidden='true' /> {t(r.vereist)}</p> : null}
      {r.grens ? <p className='ag-verbind-let ag-verbind-grens' role='note' data-verbind-grens='1'><TriangleAlert size={14} aria-hidden='true' /> {t(r.grens)}</p> : null}
      <ol className='ag-verbind-stappen' data-verbind-stappen={r.stappen.length}>
        {r.stappen.map((s, i) => <li key={i}>{t(s)}</li>)}
      </ol>
      {r.knoppen.some((k) => k.soort === 'config' || k.soort === 'opdracht') ? (
        <details className='ag-verbind-snippet' data-verbind-snippet='1'>
          <summary>{tr('Показати текст, який копіює кнопка', 'Toon de tekst die de knop kopieert')}</summary>
          {r.knoppen.filter((k) => k.kopieer).map((k, i) => <pre key={i}><code>{k.kopieer}</code></pre>)}
        </details>
      ) : null}
    </div>
  );
}
