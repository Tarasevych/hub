// «Причина» van een mislukte, geweigerde of afgebroken uitrol (audit 18.10.2026, punten 2 en 6): de echte foutregel die root vond, de
// regels eromheen en wat de gebruiker kan doen. Gebruikt door de live-kaart (LiveKaart) en de details van een run (RunDetail).
import { Lightbulb } from 'lucide-react';
import { codeHulp } from './fouten';
import { tr, type Lang, type Run } from './types';

export default function Oorzaak({ lang, run }: { lang: Lang; run: Pick<Run, 'staat' | 'code' | 'reden' | 'context'> }) {
  if (run.staat !== 'mislukt' && run.staat !== 'geweigerd' && run.staat !== 'afgebroken') return null;
  const reden = (run.reden || '').trim();
  const context = (run.context || []).filter((r) => r.trim());
  const hulp = run.code ? codeHulp(lang, run.code) : '';
  if (!reden && !hulp) return null;
  return <div className='ut-oorzaak' data-ut-oorzaak>
    {reden && <>
      <span className='ut-oorzaak-label'>{tr(lang, 'Причина', 'Oorzaak')}</span>
      <code className='ut-oorzaak-regel' title={reden}>{reden}</code>
    </>}
    {context.length > 0 && <details className='ut-oorzaak-context' open={context.length <= 6}>
      <summary>{tr(lang, `Контекст у журналі (${context.length} рядк.)`, `Context in het logboek (${context.length} regels)`)}</summary>
      <pre>{context.map((r, i) => <span key={i} data-fout={(reden && r.replace(/\s+/g, ' ').includes(reden.slice(0, 80))) || undefined}>{r}{'\n'}</span>)}</pre>
    </details>}
    {hulp && <p className='ut-oorzaak-doen'><Lightbulb aria-hidden='true' /><span><b>{tr(lang, 'Що робити: ', 'Wat nu: ')}</b>{hulp}</span></p>}
  </div>;
}
