// «Завдання», «Нотатки» en «Дошка»: taken en notities van het bord van deze lade (POST /api/mcp/board/list).
import { useEffect, useState } from 'react';
import { ArrowRight, Circle, CircleDot, Pin } from 'lucide-react';
import { haalBord, useBron, type Bord } from '../gegevens';
import { HUB_ETIKET, VAST_ETIKET, lijstAf, lijstUitTekst, ordenNotities, vormUitEtiketten } from '../../../shared/notities-model';
import { regelsVoor, tr, wanneer, type Lang, type WidgetProps } from '../soorten';
import { Fout, Leeg, Skelet } from './Vlak';

const OPEN = ['backlog', 'doing', 'blocked'];
const STAND_NAAM = (lang: Lang, s: string) => ({ backlog: tr(lang, 'У черзі', 'Wachtrij'), doing: tr(lang, 'У роботі', 'Bezig'), blocked: tr(lang, 'Заблоковано', 'Geblokkeerd'), done: tr(lang, 'Готово', 'Klaar') } as Record<string, string>)[s] || s;

export default function Taken({ lang, item, acties, zichtbaar, kolommen, zetTeller }: WidgetProps) {
  const { waarde, fout, bezig, herlaad } = useBron<Bord>((f) => haalBord(f), null, zichtbaar);
  const openAantal = item.id === 'taken' && waarde ? waarde.taken.filter((t) => OPEN.includes(t.status)).length : 0;
  useEffect(() => { zetTeller?.(openAantal > 0 ? openAantal : null, tr(lang, `${openAantal} відкритих завдань`, `${openAantal} open taken`)); }, [openAantal, lang, zetTeller]);
  const [filter, setFilter] = useState<'alle' | 'doing' | 'blocked'>('alle');
  if (fout) return <Fout lang={lang} code={fout} opnieuw={herlaad} />;
  if (!waarde) return bezig || !zichtbaar ? <Skelet rijen={4} /> : <Fout lang={lang} code='GEEN_BRON' opnieuw={herlaad} />;
  const soort = item.id;
  const max = regelsVoor(item.r, kolommen, 2, 2);

  if (soort === 'bord' || item.inst?.weergave === 'tellers' || (item.r === 1 && kolommen > 1)) {
    const tel = (s: string) => waarde.taken.filter((t) => t.status === s).length;
    const laatste = [...waarde.taken].sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt)).slice(0, Math.max(0, max - 1));
    return (
      <div className='wb-lijst-vlak'>
        <div className='wb-tellers'>
          {['backlog', 'doing', 'blocked', 'done'].map((s) => <span key={s} data-wb-stand={s}><strong>{tel(s)}</strong><small>{STAND_NAAM(lang, s)}</small></span>)}
        </div>
        {soort === 'bord' && laatste.length ? <ul className='wb-rijen'>{laatste.map((t) => <li key={t.id}><span className='wb-rij-titel'>{t.title}</span><small>{STAND_NAAM(lang, t.status)} · {wanneer(lang, Date.parse(t.updatedAt || t.createdAt) || 0)}</small></li>)}</ul> : null}
        {!waarde.taken.length ? <Leeg>{tr(lang, 'На дошці ще немає завдань.', 'Het bord heeft nog geen taken.')}</Leeg> : null}
        <button type='button' className='wb-alles' onClick={() => (soort === 'bord' ? acties.dienst('mcp', 'board') : acties.hubTab('tasks'))}>{tr(lang, 'Відкрити дошку', 'Bord openen')}<ArrowRight aria-hidden='true' /></button>
      </div>
    );
  }

  if (soort === 'notities') {
    const hub = ordenNotities(waarde.notities.filter((n) => (n.tags ?? []).includes(HUB_ETIKET)));
    const vast = item.inst?.filter === 'vast';
    const lijst = vast ? hub.filter((n) => (n.tags ?? []).includes(VAST_ETIKET)) : hub;
    return (
      <div className='wb-lijst-vlak'>
        {lijst.length ? (
          <ul className='wb-rijen wb-notities'>
            {lijst.slice(0, max).map((n) => {
              const vorm = vormUitEtiketten(n.title, n.body, n.tags);
              const regels = vorm.soort === 'lijst' ? lijstUitTekst(n.body) : [];
              return (
                <li key={n.id} data-wb-notitie={vorm.soort}>
                  {(n.tags ?? []).includes(VAST_ETIKET) ? <Pin aria-hidden='true' className='wb-pin' /> : null}
                  <span className='wb-rij-titel'>{n.title}</span>
                  <small>{vorm.soort === 'lijst' && regels.length ? `${lijstAf(regels)}/${regels.length}` : n.body.replace(/\s+/g, ' ').slice(0, 80)}</small>
                </li>
              );
            })}
          </ul>
        ) : <Leeg>{vast ? tr(lang, 'Ви ще нічого не закріпили.', 'U hebt nog niets vastgezet.') : tr(lang, 'Нотаток ще немає.', 'Nog geen notities.')}</Leeg>}
        <button type='button' className='wb-alles' onClick={() => acties.hubTab('notes')}>{tr(lang, 'До нотаток', 'Naar notities')}<ArrowRight aria-hidden='true' /></button>
      </div>
    );
  }

  const open = waarde.taken.filter((t) => OPEN.includes(t.status));
  const getoond = (filter === 'alle' ? open : open.filter((t) => t.status === filter)).slice(0, Math.max(1, max - 1));
  return (
    <div className='wb-lijst-vlak'>
      <div className='wb-chips' role='group' aria-label={tr(lang, 'Фільтр завдань', 'Taakfilter')}>
        {([['alle', tr(lang, 'Усі', 'Alle'), open.length], ['doing', tr(lang, 'У роботі', 'Bezig'), open.filter((t) => t.status === 'doing').length], ['blocked', tr(lang, 'Заблоковані', 'Geblokkeerd'), open.filter((t) => t.status === 'blocked').length]] as const).map(([id, naam, n]) => (
          <button key={id} type='button' className={filter === id ? 'is-actief' : ''} aria-pressed={filter === id} onClick={() => setFilter(id)}>{naam}<span className='wb-chip-n'>{n}</span></button>
        ))}
      </div>
      {getoond.length ? (
        <ul className='wb-rijen wb-taken'>
          {getoond.map((t) => (
            <li key={t.id} data-wb-taak={t.status}>
              {t.status === 'doing' ? <CircleDot aria-hidden='true' className='wb-taak-stip is-doing' /> : <Circle aria-hidden='true' className='wb-taak-stip' />}
              <span className='wb-rij-titel'>{t.title}</span>
              <span className='wb-taak-meta'>{t.tags.slice(0, 1).map((x) => <span key={x} className='pil pil-stil'>{x}</span>)}<small className={`wb-taak-stand is-${t.status}`}>{STAND_NAAM(lang, t.status)}</small></span>
            </li>
          ))}
        </ul>
      ) : <Leeg>{open.length ? tr(lang, 'За цим фільтром завдань немає.', 'Geen taken voor dit filter.') : tr(lang, 'Відкритих завдань немає. Додайте завдання у вкладці «Завдання».', 'Er zijn geen open taken. Voeg een taak toe in het tabblad «Taken».')}</Leeg>}
      <button type='button' className='wb-alles' onClick={() => acties.hubTab('tasks')}>{tr(lang, 'Переглянути всі', 'Alles bekijken')}<ArrowRight aria-hidden='true' /></button>
    </div>
  );
}
