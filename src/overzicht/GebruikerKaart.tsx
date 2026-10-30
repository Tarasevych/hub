// Kaart van één gebruiker: wanneer actief, op welke apparaatklassen, en de tijdlijn van handelingen op de site.
// Alleen soort handeling, sectie, tijd, uitkomst en apparaatklasse — nooit inhoud van mails/bestanden, geheimen, tokens of volledige IP-adressen
// (de server levert die niet eens; zie backend/beheer-overzicht-kern.ts). Het openen van deze kaart wordt in het logboek vastgelegd.
import { useEffect, useRef, useState } from 'react';
import { RefreshCw, TriangleAlert, X } from 'lucide-react';
import { haalGebruiker } from './api';
import { Avatar, Geleden } from './widgets';
import { Gebied, getal, Staven } from './grafieken';
import type { Context, GebruikerHistorie, Lang } from './types';
import { tr } from './types';

export default function GebruikerKaart({ id, ctx, lang, nu, onSluit }: { id: string; ctx: Context; lang: Lang; nu: number; onSluit: () => void }) {
  const [data, setData] = useState<GebruikerHistorie | null>(null);
  const [fout, setFout] = useState('');
  const sluitRef = useRef<HTMLButtonElement>(null);
  const terug = useRef<Element | null>(null);

  useEffect(() => {
    terug.current = document.activeElement;
    sluitRef.current?.focus();
    return () => { if (terug.current instanceof HTMLElement) terug.current.focus(); };
  }, []);
  useEffect(() => {
    let weg = false;
    setData(null); setFout('');
    haalGebruiker(ctx, id).then((d) => { if (!weg) setData(d); }).catch((e) => {
      if (weg) return;
      const code = String(e?.response?.data?.error || e?.message || '');
      setFout(/CAPABILITY/.test(code) ? tr(lang, 'Для історії дій потрібне право читання журналу.', 'Voor de actiegeschiedenis is het recht om het logboek te lezen nodig.') : tr(lang, 'Не вдалося завантажити картку користувача.', 'De gebruikerskaart kon niet worden geladen.'));
    });
    return () => { weg = true; };
  }, [id, ctx.tabContext, lang]);
  useEffect(() => {
    const toets = (e: KeyboardEvent) => { if (e.key === 'Escape') onSluit(); };
    window.addEventListener('keydown', toets);
    return () => window.removeEventListener('keydown', toets);
  }, [onSluit]);

  const g = data?.gebruiker;
  const dagKop = (t: number) => new Date(t).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { weekday: 'long', day: 'numeric', month: 'long' });
  const groepen: Array<{ dag: string; items: GebruikerHistorie['tijdlijn'] }> = [];
  for (const e of data?.tijdlijn ?? []) {
    const k = dagKop(e.t); const l = groepen[groepen.length - 1];
    if (l && l.dag === k) l.items.push(e); else groepen.push({ dag: k, items: [e] });
  }
  return (
    <div className="ov-modal-schaduw" onMouseDown={(e) => { if (e.target === e.currentTarget) onSluit(); }}>
      <aside className="ov-modal" role="dialog" aria-modal="true" aria-labelledby="ov-kaart-titel" data-testid="gebruikerskaart">
        <header className="ov-modal-kop">
          {g ? <Avatar id={g.id} naam={g.naam} foto={g.foto} grootte={48} /> : <span className="ov-avatar ov-avatar-letters" style={{ width: 48, height: 48 }} aria-hidden="true" />}
          <div>
            <h2 id="ov-kaart-titel">{g?.naam ?? tr(lang, 'Користувач', 'Gebruiker')}</h2>
            <p>{g ? [g.mail, g.rol, g.status].filter(Boolean).join(' · ') || '—' : tr(lang, 'Завантаження…', 'Laden…')}</p>
          </div>
          <button ref={sluitRef} type="button" className="ov-sluit" onClick={onSluit} aria-label={tr(lang, 'Закрити', 'Sluiten')}><X aria-hidden="true" /></button>
        </header>
        <div className="ov-modal-body">
          {fout && <p className="ov-fout" role="alert"><TriangleAlert aria-hidden="true" /> {fout}</p>}
          {!data && !fout && <p className="ov-leeg"><RefreshCw className="spin" aria-hidden="true" /> {tr(lang, 'Завантажуємо історію…', 'Geschiedenis laden…')}</p>}
          {data && (
            <>
              <p className="ov-privacy">{tr(lang, 'Показано лише тип дії, розділ, час, результат і клас пристрою. Вміст листів, файлів, секрети й IP не показуються.', 'Alleen soort actie, onderdeel, tijd, uitkomst en apparaatklasse. Mail- en bestandsinhoud, geheimen en IP worden niet getoond.')}</p>
              <dl className="ov-kaart-kpi">
                <div><dt>{tr(lang, 'Стан', 'Status')}</dt><dd>{data.kpi.online ? <span className="ov-live"><i aria-hidden="true" />{tr(lang, 'онлайн', 'online')}</span> : tr(lang, 'не в мережі', 'offline')}</dd></div>
                <div><dt>{tr(lang, 'Востаннє активний(на)', 'Laatst actief')}</dt><dd>{data.kpi.laatstGezien ? <Geleden t={data.kpi.laatstGezien} nu={nu} lang={lang} /> : '—'}</dd></div>
                <div><dt>{tr(lang, 'Відкриті сесії', 'Open sessies')}</dt><dd>{getal(lang, data.kpi.actieveSessies)}</dd></div>
                <div><dt>{tr(lang, 'Дії / збої', 'Acties / storingen')}</dt><dd>{getal(lang, data.kpi.events)} / {getal(lang, data.kpi.mislukt)}</dd></div>
              </dl>
              <section aria-labelledby="ov-kaart-act"><h3 id="ov-kaart-act">{tr(lang, 'Активність за 14 днів', 'Activiteit in 14 dagen')}</h3>
                {data.kpi.events === 0 ? <p className="ov-leeg">{tr(lang, 'Даних про дії поки немає.', 'Nog geen gegevens over acties.')}</p> : <Gebied punten={data.perDag} lang={lang} stap="dag" naamN={tr(lang, 'Дії', 'Acties')} naamF={tr(lang, 'Збої', 'Storingen')} />}
              </section>
              <div className="ov-tweekol">
                <section><h3>{tr(lang, 'Розділи', 'Onderdelen')}</h3><Staven lang={lang} rijen={data.secties.map((s) => ({ sleutel: s.sleutel, naam: tr(lang, s.uk, s.nl), n: s.n }))} leeg="—" /></section>
                <section><h3>{tr(lang, 'Пристрої (активні сесії)', 'Apparaten (actieve sessies)')}</h3><Staven lang={lang} kleur="var(--ov-s3)" rijen={data.apparaten} leeg="—" /></section>
              </div>
              <section aria-labelledby="ov-kaart-tijd"><h3 id="ov-kaart-tijd">{tr(lang, 'Хронологія', 'Tijdlijn')}</h3>
                {groepen.length === 0 ? <p className="ov-leeg">{tr(lang, 'Подій немає.', 'Geen gebeurtenissen.')}</p> : groepen.map((gr) => (
                  <div key={gr.dag} className="ov-dag">
                    <h4>{gr.dag}</h4>
                    <ol>
                      {gr.items.map((e) => (
                        <li key={e.id} className={e.mislukt ? 'ov-mislukt' : ''}>
                          <time dateTime={new Date(e.t).toISOString()}>{new Date(e.t).toLocaleTimeString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { hour: '2-digit', minute: '2-digit' })}</time>
                          <span>{e.mislukt && <TriangleAlert className="ov-bad-ic" aria-label={tr(lang, 'Невдало', 'Mislukt')} />}{tr(lang, e.label.uk, e.label.nl)}<em>{tr(lang, e.sectieNaam.uk, e.sectieNaam.nl)}</em></span>
                          {e.apparaat && <small>{e.apparaat}</small>}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
