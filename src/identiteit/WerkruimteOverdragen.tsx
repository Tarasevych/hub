// IDENTITEIT-015 (крок «profiel-blokken»): «Передати простір» у розділі видалення облікового запису.
// Werkruimte overdragen vóór het verwijderen van het account: anders gaat de ruimte mee het archief in.
//
// Кандидатів і права перевіряє сервер (POST /api/owner/identity/workspaces/overdracht/kandidaten і …/:id/overdragen);
// інтерфейс лише показує. Перед передачею — вікно підтвердження з наслідками; далі сервер просить «Підтвердіть доступ»
// (step-up, src/platform/client.ts повторює запит сам). Повторне натискання після успіху сервер приймає без змін.
import { useCallback, useEffect, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { BevestigDialoog } from '../platform/BevestigDialoog';
import { foutNaarTekst } from '../weigeringen';
import { ROL_TEKST, type WerkruimteRol } from '../../shared/werkruimte-rechten';

type Kandidaat = { userId: string; naam: string; email: string; rol: WerkruimteRol };
type Ruimte = { id: string; name: string; kandidaten: Kandidaat[] };
type Post = (pad: string, lichaam: Record<string, unknown>) => Promise<Record<string, unknown>>;

export function WerkruimteOverdragen({ lang, post, onMelding }: { lang: 'uk' | 'nl'; post: Post; onMelding: (p: readonly [string, string]) => void }) {
  const tr = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [ruimtes, setRuimtes] = useState<Ruimte[] | null>(null);
  const [keuze, setKeuze] = useState<Record<string, string>>({});
  const [vraag, setVraag] = useState<{ ruimte: Ruimte; doel: Kandidaat } | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');

  const laden = useCallback(async () => {
    try {
      const d = await post('/api/owner/identity/workspaces/overdracht/kandidaten', {});
      setRuimtes(Array.isArray(d.werkruimtes) ? (d.werkruimtes as Ruimte[]) : []);
      setFout('');
    } catch (e) {
      const w = foutNaarTekst(e);
      setFout(w ? tr(w[0], w[1]) : tr('Не вдалося завантажити список просторів. Оновіть сторінку.', 'De lijst met werkruimtes kon niet worden geladen. Vernieuw de pagina.'));
      setRuimtes([]);
    }
  }, [post, lang]);
  useEffect(() => { void laden(); }, [laden]);

  const overdragen = async () => {
    const v = vraag;
    setVraag(null);
    if (!v) return;
    setBezig(true);
    try {
      await post(`/api/owner/identity/workspaces/${encodeURIComponent(v.ruimte.id)}/overdragen`, { nieuweEigenaarId: v.doel.userId });
      const wie = v.doel.naam || v.doel.email;
      onMelding([`Простір «${v.ruimte.name}» тепер належить ${wie}. Ви — адміністратор цього простору.`, `De werkruimte «${v.ruimte.name}» is nu van ${wie}. U bent er beheerder.`]);
      await laden();
    } catch (e) {
      const w = foutNaarTekst(e);
      onMelding(w || ['Простір не передано. Нічого не змінено — спробуйте ще раз.', 'De werkruimte is niet overgedragen. Er is niets gewijzigd — probeer het opnieuw.']);
      await laden();
    } finally {
      setBezig(false);
    }
  };

  if (ruimtes === null) return <p className='settings-honest-note' data-overdracht-laden>{tr('Завантаження ваших просторів…', 'Uw werkruimtes worden geladen…')}</p>;
  return (
    <div className='settings-overdracht' data-werkruimte-overdracht>
      <h4><ArrowRightLeft />{tr('Передати простір перед видаленням', 'Werkruimte overdragen vóór het verwijderen')}</h4>
      <p>{tr('Після видалення облікового запису ваші простори йдуть в архів, і учасники втрачають до них доступ. Щоб простір і його блоки лишилися в людей, передайте його учасникові з роллю «Адміністратор» або «Редагування».', 'Na het verwijderen van het account gaan uw werkruimtes naar het archief en verliezen de leden de toegang. Wilt u dat de werkruimte en de blokken blijven, draag ze dan over aan een lid met de rol «Beheerder» of «Bewerken».')}</p>
      {fout && <p className='settings-honest-note' role='alert'>{fout}</p>}
      {!ruimtes.length && !fout && <p className='settings-honest-note' data-overdracht-geen>{tr('У вас немає активних власних просторів, які можна передати.', 'U hebt geen actieve eigen werkruimtes om over te dragen.')}</p>}
      {ruimtes.map((r) => {
        const gekozen = r.kandidaten.find((k) => k.userId === keuze[r.id]) || r.kandidaten[0];
        return (
          <div key={r.id} className='settings-overdracht-rij' data-overdracht-ruimte={r.id}>
            <strong>{r.name || tr('Простір без назви', 'Werkruimte zonder naam')}</strong>
            {r.kandidaten.length ? (
              <>
                <label>{tr('Новий власник', 'Nieuwe eigenaar')}
                  <select value={gekozen?.userId || ''} disabled={bezig} onChange={(e) => setKeuze((k) => ({ ...k, [r.id]: e.target.value }))}>
                    {r.kandidaten.map((k) => <option key={k.userId} value={k.userId}>{`${k.naam || k.email} · ${ROL_TEKST[k.rol][lang === 'uk' ? 0 : 1]}`}</option>)}
                  </select>
                </label>
                <button type='button' className='settings-danger-button' disabled={bezig || !gekozen} onClick={() => gekozen && setVraag({ ruimte: r, doel: gekozen })}>
                  {tr('Передати…', 'Overdragen…')}
                </button>
              </>
            ) : (
              <small data-overdracht-geen-kandidaten>{tr('Немає кому передати: спершу надайте людині роль «Адміністратор» або «Редагування» в розділі «Доступ до простору». Глядачеві передати не можна.', 'Niemand om aan over te dragen: geef eerst iemand de rol «Beheerder» of «Bewerken» onder «Toegang tot werkruimte». Aan een kijker overdragen kan niet.')}</small>
            )}
          </div>
        );
      })}
      <BevestigDialoog
        open={!!vraag}
        id='werkruimte-overdragen'
        lang={lang}
        gevaarlijk
        titel={tr(`Передати простір «${vraag?.ruimte.name || ''}»?`, `Werkruimte «${vraag?.ruimte.name || ''}» overdragen?`)}
        uitleg={tr(`Новим власником стане ${vraag?.doel.naam || vraag?.doel.email || ''}.`, `${vraag?.doel.naam || vraag?.doel.email || ''} wordt de nieuwe eigenaar.`)}
        gevolgen={[
          tr('Новий власник керуватиме учасниками й блоками й зможе видалити простір. Скасувати передачу самостійно не можна — лише попросити повернути.', 'De nieuwe eigenaar beheert leden en blokken en kan de werkruimte verwijderen. Zelf terugdraaien kan niet — alleen vragen om teruggave.'),
          tr('Ви лишитеся в просторі адміністратором, доки новий власник не змінить вашу роль.', 'U blijft beheerder van de werkruimte tot de nieuwe eigenaar uw rol wijzigt.'),
          tr('Простір не піде в архів, якщо ви потім видалите свій обліковий запис.', 'De werkruimte gaat niet naar het archief als u daarna uw account verwijdert.'),
          tr('Обидва отримаєте сповіщення; сайт попросить підтвердити доступ.', 'U krijgt allebei een melding; de site vraagt u de toegang te bevestigen.'),
        ]}
        bevestigTekst={tr('Так, передати', 'Ja, overdragen')}
        bezig={bezig}
        onAnnuleer={() => setVraag(null)}
        onBevestig={overdragen}
      />
    </div>
  );
}
