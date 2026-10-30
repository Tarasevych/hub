// «Пошта»: laatste berichten + ongelezen, uit POST /api/owner/hub/blocks/data (zelfde bron als het oude bureaublad).
import { useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { loadHubBlockData, readHubBlockDataCache, useBron, type HubBlockDataPayload } from '../gegevens';
import { initialen, regelsVoor, tr, wanneer, type WidgetProps } from '../soorten';
import { BronToestand, Fout, Skelet } from './Vlak';

export default function Post({ lang, item, acties, zichtbaar, ownerUserId: owner, kolommen, zetTeller }: WidgetProps) {
  const { waarde, fout, bezig, herlaad } = useBron<HubBlockDataPayload>((f) => loadHubBlockData(owner, f), readHubBlockDataCache(owner), zichtbaar);
  const ongelezen = waarde?.sources?.mail?.status === 'ready' ? Number(waarde.sources.mail.unread || 0) : 0;
  useEffect(() => { zetTeller?.(ongelezen > 0 ? ongelezen : null, tr(lang, `${ongelezen} непрочитаних`, `${ongelezen} ongelezen`)); }, [ongelezen, lang, zetTeller]);
  if (fout) return <Fout lang={lang} code={fout} opnieuw={herlaad} />;
  const bron = waarde?.sources?.mail;
  if (!bron) return bezig || !zichtbaar ? <Skelet rijen={4} /> : <Fout lang={lang} code='GEEN_BRON' opnieuw={herlaad} />;
  const toestand = BronToestand({ lang, bron, soort: 'mail', acties, leeg: tr(lang, 'У проєкції ще немає листів.', 'De projectie bevat nog geen berichten.') });
  if (toestand) return toestand;
  const tellers = item.inst?.weergave === 'tellers' || (item.r === 1 && kolommen > 1);
  const max = regelsVoor(item.r, kolommen, 2, 2);
  return (
    <div className='wb-lijst-vlak'>
      {tellers ? (
        <div className='wb-tellers'>
          <span><strong>{bron.total}{bron.bounded ? '+' : ''}</strong><small>{tr(lang, 'листів у проєкції', 'berichten in projectie')}</small></span>
          <span><strong>{Number(bron.unread || 0)}</strong><small>{tr(lang, 'непрочитаних', 'ongelezen')}</small></span>
        </div>
      ) : (
        <ul className='wb-post'>
          {bron.items.slice(0, max).map((m) => {
            const [naam] = m.subtitle.split(' · ');
            return (
              <li key={m.id} className={m.badge === 'unread' ? 'is-ongelezen' : ''}>
                <span className='wb-avatar' aria-hidden='true'>{initialen(naam || m.title)}</span>
                <span className='wb-post-tekst'><strong>{naam || tr(lang, 'Без відправника', 'Zonder afzender')}</strong><small>{m.title}</small></span>
                <time dateTime={m.updatedAt ? new Date(m.updatedAt).toISOString() : undefined}>{wanneer(lang, m.updatedAt)}</time>
              </li>
            );
          })}
        </ul>
      )}
      <button type='button' className='wb-alles' onClick={() => acties.dienst('mail', 'inbox')}>{tr(lang, 'Переглянути всі', 'Alles bekijken')}<ArrowRight aria-hidden='true' /></button>
    </div>
  );
}
