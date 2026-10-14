// De schakelaars van de MCP-deur (root-bestand op de server, alleen lezen): sitebeheer, dus op mcp.*/dashboard in het technisch
// profiel — niet meer op «Токени й двері» in de accountruimte. Dezelfde gegevens (/api/mcp/permissions) als voorheen.
import { DoorOpen } from 'lucide-react';
import { Help, Section, type Tr } from '../mcp-ui';
import { useDeurTokens } from './data';
import { SWITCHES } from './deur';
import { Badge } from './ui';
import '../mcp-hub.css';
import './agenten.css';

export default function DeurSchakelaars({ tr }: { tr: Tr }) {
  const { data } = useDeurTokens();
  return (
    <Section id='ag-deuren' icon={<DoorOpen />} title={tr('Двері: що дозволено агентам', 'Deur: wat agenten mogen')} subtitle={tr('Лише показ. Змінює тільки власник сервера у файлі (root).', 'Alleen weergave. Alleen de eigenaar van de server wijzigt dit in het bestand (root).')} defaultOpen={false}>
      {data ? (
        <table className='ai-tabel ag-deuren'>
          <thead><tr><th scope='col'>{tr('Перемикач', 'Schakelaar')}</th><th scope='col'>{tr('Стан', 'Stand')}</th></tr></thead>
          <tbody>{[...SWITCHES.map((s) => s.id), ...data.catalogus.map((p) => p.id).filter((id) => !SWITCHES.some((s) => s.id === id))].map((id) => { const l = SWITCHES.find((s) => s.id === id); const r = data.catalogus.find((p) => p.id === id); const p = { id, uk: r?.uk || l?.uk || id, nl: r?.nl || l?.nl || id, uitleg: l ? { title: tr(l.uk, l.nl), on: tr(l.onUk, l.onNl), off: tr(l.offUk, l.offNl) } : null }; return <tr key={p.id} data-deur={p.id}><td>{tr(p.uk, p.nl)} {p.uitleg ? <Help tr={tr} content={p.uitleg} /> : null} <code className='hub-meta'>{p.id}</code></td><td><Badge toon={data.rechten[p.id] ? 'ok' : 'off'}>{data.rechten[p.id] ? tr('увімкнено', 'aan') : tr('вимкнено', 'uit')}</Badge></td></tr>; })}</tbody>
        </table>
      ) : <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p>}
      {data?.bestand ? <p className='hub-meta'>{tr('Файл', 'Bestand')}: <code>{data.bestand}</code></p> : null}
    </Section>
  );
}
