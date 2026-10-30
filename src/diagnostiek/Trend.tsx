// Trend van de diagnostiek: balkjes per dag (laatste 14 dagen), weektotalen en «wat faalde het vaakst». Pure SVG/CSS, geen bibliotheek.
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { CONTROLES } from '../../shared/beheer-diagnostiek';
import { tekstUit, type Lang, type Trend } from './hulp';

const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);

export default function TrendBlok({ lang, trend }: { lang: Lang; trend: Trend }) {
  const dagen = trend.dagen;
  const max = Math.max(1, ...dagen.map((d) => d.ok + d.slecht));
  const fmt = (ms: number) => new Date(ms).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { day: '2-digit', month: '2-digit' });
  return (
    <section className='adg-trend' data-adg-trend aria-label={tr(lang, 'Тренд перевірок', 'Trend van de controles')}>
      <header><h3><TrendingUp />{tr(lang, 'Тренд за 14 днів', 'Trend over 14 dagen')}</h3>
        <p>{tr(lang, `За тиждень: ${trend.week.uitvoeringen} перевірок, з них із проблемою — ${trend.week.slecht}.`, `Deze week: ${trend.week.uitvoeringen} controles, waarvan met een probleem — ${trend.week.slecht}.`)}</p></header>
      {dagen.length === 0
        ? <p className='adg-leeg'>{tr(lang, 'Даних для тренду ще немає — запустіть «Перевірити все».', 'Nog geen gegevens voor een trend — start «Alles controleren».')}</p>
        : <div className='adg-trend-balken' role='img' aria-label={tr(lang, 'Кількість перевірок за днями; червоним — проблеми', 'Aantal controles per dag; rood = problemen')}>
            {dagen.map((d) => (
              <div key={d.dag} title={`${fmt(d.dag)}: ${d.ok + d.slecht}, ${tr(lang, 'проблем', 'problemen')}: ${d.slecht}`}>
                <span className='adg-trend-stapel' style={{ height: `${Math.max(4, ((d.ok + d.slecht) / max) * 100)}%` }}>
                  {d.slecht > 0 && <i style={{ flex: d.slecht }} />}<b style={{ flex: Math.max(0.0001, d.ok) }} />
                </span>
                <small>{fmt(d.dag)}</small>
              </div>
            ))}
          </div>}
      {trend.top.length > 0 && (
        <div className='adg-trend-top'>
          <h4><AlertTriangle />{tr(lang, 'Найчастіше падало (7 днів)', 'Faalde het vaakst (7 dagen)')}</h4>
          <ol>{trend.top.map((t) => { const def = CONTROLES.find((c) => c.id === t.id); return <li key={t.id}><span>{def ? tekstUit(lang, def.naam) : t.id}</span><b>{t.n}×</b></li>; })}</ol>
        </div>
      )}
    </section>
  );
}
