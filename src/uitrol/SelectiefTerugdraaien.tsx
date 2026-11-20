// UPD-011: Реєстр змін кожного випуску (джерело: GitHub / MCP / Сайт / SSH, файли, міграції, 3 чинники)
// + пофайлове порівняння й вибіркове відкликання конкретного оновлення без втрати пізніших випусків.
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, FileDiff, GitBranch, RefreshCw, Undo2 } from 'lucide-react';
import { api } from '../platform/client';
import { tr, type Lang } from './types';
import { herkomstLabel } from '../../shared/uitrol-drie-factoren';
import type { ReleaseVergelijking, ReleaseWijzigingItem, SelectiefTerugdraaiPlan } from '../../shared/uitrol-selectief-terugdraaien';

type Props = {
  lang: Lang;
  context: Record<string, unknown>;
};

export default function SelectiefTerugdraaien({ lang, context }: Props) {
  const [actieveVersie, setActieveVersie] = useState('');
  const [releases, setReleases] = useState<ReleaseWijzigingItem[]>([]);
  const [laadt, setLaadt] = useState(false);
  const [fout, setFout] = useState('');
  const [gekozen, setGekozen] = useState('');
  const [vergelijk, setVergelijk] = useState<{
    vergelijking: ReleaseVergelijking;
    plan: SelectiefTerugdraaiPlan;
    aiOpdrachtUk: string;
    aiOpdrachtNl: string;
  } | null>(null);
  const [reden, setReden] = useState('');
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState('');
  const [gekopieerd, setGekopieerd] = useState(false);

  const laden = useCallback(async () => {
    setLaadt(true);
    try {
      const r = (await api.post('/api/owner/uitrol/releases', { ...context, limiet: 60 })).data as {
        actieveVersie: string;
        releases: ReleaseWijzigingItem[];
      };
      setActieveVersie(r.actieveVersie || '');
      setReleases(r.releases || []);
      setFout('');
    } catch {
      setFout(tr(lang, 'Не вдалося завантажити реєстр змін випусків.', 'Het wijzigingsregister van releases kon niet worden geladen.'));
    } finally {
      setLaadt(false);
    }
  }, [context, lang]);

  useEffect(() => { void laden(); }, [laden]);

  const openVergelijk = async (versie: string) => {
    setGekozen(versie);
    setVergelijk(null);
    setMelding('');
    setFout('');
    try {
      const r = (await api.post('/api/owner/uitrol/releases/vergelijk', { ...context, versie, huidigeVersie: actieveVersie })).data as {
        vergelijking: ReleaseVergelijking;
        plan: SelectiefTerugdraaiPlan;
        aiOpdrachtUk: string;
        aiOpdrachtNl: string;
      };
      setVergelijk(r);
    } catch {
      setFout(tr(lang, 'Не вдалося побудувати пофайлове порівняння цього випуску.', 'Bestandsvergelijking voor deze release kon niet worden opgebouwd.'));
    }
  };

  const vraagSelectiefAan = async () => {
    if (!gekozen) return;
    if (reden.trim().length < 4) {
      setFout(tr(lang, 'Вкажіть причину вибіркового відкликання (від 4 символів).', 'Geef een reden voor selectief intrekken (minstens 4 tekens).'));
      return;
    }
    setBezig(true); setFout(''); setMelding('');
    try {
      const r = (await api.post('/api/owner/uitrol/releases/selectief-aanvragen', {
        ...context,
        versie: gekozen,
        huidigeVersie: actieveVersie,
        reden: reden.trim(),
      })).data as { plan: SelectiefTerugdraaiPlan; aiOpdrachtUk: string; aiOpdrachtNl: string };
      setVergelijk((oud) => (oud ? { ...oud, ...r } : null));
      setReden('');
      setMelding(tr(lang, `План вибіркового відкликання ${gekozen} зафіксовано в реєстрі та доступний ШІ через MCP. Пізніші оновлення збережено.`, `Plan voor selectief intrekken van ${gekozen} vastgelegd in het register en beschikbaar voor AI via MCP. Latere updates blijven behouden.`));
      await laden();
    } catch {
      setFout(tr(lang, 'Не вдалося зафіксувати план вибіркового відкликання.', 'Het plan voor selectief intrekken kon niet worden vastgelegd.'));
    } finally {
      setBezig(false);
    }
  };

  const kopieerOpdracht = () => {
    if (!vergelijk) return;
    const tekst = lang === 'nl' ? vergelijk.aiOpdrachtNl : vergelijk.aiOpdrachtUk;
    void navigator.clipboard?.writeText(tekst).then(() => {
      setGekopieerd(true);
      window.setTimeout(() => setGekopieerd(false), 2500);
    }).catch(() => undefined);
  };

  return (
    <section className='ut-kaart ut-sel-kaart' data-ut-selectief-register aria-labelledby='ut-sel-titel'>
      <header className='ut-kaart-kop'>
        <div>
          <h2 id='ut-sel-titel'><FileDiff aria-hidden='true' /> {tr(lang, 'Реєстр змін випусків і вибіркове відкликання', 'Wijzigingsregister en selectief intrekken')}</h2>
          <p className='ut-sub'>
            {tr(
              lang,
              'Видно точне джерело кожного оновлення (GitHub, MCP ШІ, сайт або SSH), 3-чинниковий статус, змінені файли та план відкликання ЛИШЕ одного конкретного випуску без втрати пізніших оновлень.',
              'Toont de precieze bron van elke update (GitHub, MCP AI, site of SSH), driefactorstatus, gewijzigde bestanden en een plan om ALLEEN één release in te trekken zonder latere updates te verliezen.',
            )}
          </p>
        </div>
        <button type='button' className='ut-knop' disabled={laadt} onClick={() => void laden()}>
          <RefreshCw aria-hidden='true' className={laadt ? 'spin' : undefined} />
          {tr(lang, 'Оновити', 'Vernieuwen')}
        </button>
      </header>

      {fout && <p className='ut-fout' role='alert'>{fout}</p>}
      {melding && <p className='ut-ok-tekst' role='status'>{melding}</p>}

      <ul className='ut-sel-lijst' data-ut-sel-aantal={releases.length}>
        {releases.length === 0 && (
          <li className='ut-leeg'>{tr(lang, 'Реєстр змін наповниться автоматично після наступного завантаження чи встановлення випуску.', 'Het wijzigingsregister vult zich automatisch bij de volgende upload of installatie.')}</li>
        )}
        {releases.map((r) => (
          <li key={r.versie} className='ut-sel-item' data-gekozen={gekozen === r.versie || undefined}>
            <div className='ut-sel-kop'>
              <div>
                <b className='ut-mono'>{r.versie}</b>
                {r.versie === actieveVersie && <i className='ut-badge' data-staat='klaar'>{tr(lang, 'Активна', 'Actief')}</i>}
                <i className='ut-badge ut-sel-bron' data-bron={r.herkomstKanaal}>{herkomstLabel(r.herkomstKanaal, lang)}</i>
                {r.drieFactoren && (
                  <i className='ut-badge' data-staat={r.drieFactoren.volledig ? 'klaar' : 'bezig'}>
                    {r.drieFactoren.aantalOk}/3 {tr(lang, 'чинники', 'factoren')}
                  </i>
                )}
                {r.status === 'selectief_aangevraagd' && (
                  <i className='ut-badge' data-staat='afgebroken'>{tr(lang, 'Відкликання заплановано', 'Intrekken gepland')}</i>
                )}
              </div>
              <button type='button' className='ut-knop' onClick={() => void openVergelijk(r.versie)}>
                <Undo2 aria-hidden='true' />
                {tr(lang, 'Порівняти / відкликати лише це', 'Vergelijken / alleen deze intrekken')}
              </button>
            </div>
            <p className='ut-sub'>
              {(lang === 'nl' ? r.samenvattingNl : r.samenvattingUk) || tr(lang, 'Без опису', 'Zonder beschrijving')}
              {r.agent ? ` · ${tr(lang, 'агент', 'agent')}: ${r.agent}` : ''}
              {r.bestanden.length > 0 ? ` · ${r.bestanden.length} ${tr(lang, 'файл(ів)', 'bestand(en)')}` : ''}
              {r.migraties.length > 0 ? ` · ${r.migraties.length} ${tr(lang, 'мігр.', 'migr.')}` : ''}
            </p>
          </li>
        ))}
      </ul>

      {vergelijk && (
        <div className='ut-sel-plan' data-ut-sel-plan={vergelijk.plan.doelVersie}>
          <h3>
            <GitBranch aria-hidden='true' />
            {tr(lang, `Аналіз вибіркового відкликання ${vergelijk.plan.doelVersie} (поточна: ${vergelijk.plan.huidigeVersie})`, `Analyse selectief intrekken ${vergelijk.plan.doelVersie} (huidige: ${vergelijk.plan.huidigeVersie})`)}
          </h3>
          <p>{lang === 'nl' ? vergelijk.plan.samenvattingNl : vergelijk.plan.samenvattingUk}</p>

          <div className='ut-sel-stat-grid'>
            <div className='ut-sel-stat'>
              <CheckCircle2 aria-hidden='true' />
              <strong>{vergelijk.plan.veiligDirectTerugtezetten.length}</strong>
              <span>{tr(lang, 'Файлів чистого відкату', 'Bestanden schoon terug')}</span>
            </div>
            <div className='ut-sel-stat'>
              <AlertTriangle aria-hidden='true' />
              <strong>{vergelijk.plan.overlappendeBestanden.length}</strong>
              <span>{tr(lang, 'З перетином пізніших змін', 'Met latere overlapping')}</span>
            </div>
            <div className='ut-sel-stat'>
              <CheckCircle2 aria-hidden='true' />
              <strong>{vergelijk.plan.behoudenLatereVersies.length}</strong>
              <span>{tr(lang, 'Пізніших випусків збережено', 'Latere releases behouden')}</span>
            </div>
          </div>

          {vergelijk.plan.overlappendeBestanden.length > 0 && (
            <details className='ut-sel-details'>
              <summary>{tr(lang, `Файли з перетином у пізніших випусках (${vergelijk.plan.overlappendeBestanden.length})`, `Overlappende bestanden in latere releases (${vergelijk.plan.overlappendeBestanden.length})`)}</summary>
              <ul>
                {vergelijk.plan.overlappendeBestanden.map((o) => (
                  <li key={o.pad}><code className='ut-mono'>{o.pad}</code> — {o.latereVersies.join(', ')}</li>
                ))}
              </ul>
            </details>
          )}

          {vergelijk.plan.waarschuwingMigraties.length > 0 && (
            <p className='ut-fout'>
              <AlertTriangle aria-hidden='true' />
              {tr(lang, `Увага на міграції БД (${vergelijk.plan.waarschuwingMigraties.join(', ')}): їх не видаляють руйнівно, щоб зберегти дані пізніших версій.`, `Let op databasemigraties (${vergelijk.plan.waarschuwingMigraties.join(', ')}): deze worden niet vernietigend verwijderd zodat gegevens van latere versies blijven.`)}
            </p>
          )}

          <div className='ut-sel-opdracht'>
            <div className='ut-3f-eenmalig-kop'>
              <strong>{tr(lang, 'Готове завдання для ШІ / GitHub (вибірковий відкат)', 'Kant-en-klare opdracht voor AI / GitHub (selectief intrekken)')}</strong>
              <button type='button' className='ut-knop' onClick={kopieerOpdracht}>
                <Copy aria-hidden='true' />{gekopieerd ? tr(lang, 'Скопійовано', 'Gekopieerd') : tr(lang, 'Копіювати завдання', 'Opdracht kopiëren')}
              </button>
            </div>
            <pre>{lang === 'nl' ? vergelijk.aiOpdrachtNl : vergelijk.aiOpdrachtUk}</pre>
          </div>

          <div className='ut-3f-intrek-rij'>
            <input type='text' value={reden} onChange={(e) => setReden(e.target.value)} maxLength={300}
              placeholder={tr(lang, 'Причина вибіркового відкликання (збережеться в журналі й MCP)…', 'Reden voor selectief intrekken (wordt opgeslagen in logboek en MCP)…')} />
            <button type='button' className='ut-knop ut-knop-primair' disabled={bezig} onClick={() => void vraagSelectiefAan()}>
              <Undo2 aria-hidden='true' />
              {tr(lang, 'Зафіксувати план вибіркового відкликання', 'Plan voor selectief intrekken vastleggen')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
