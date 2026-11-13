// SEC-002 (integraties-09): «Запрошення для вас» — uitnodigingen voor een woning die AAN MIJ gericht zijn. Lid word ik pas als ik
// hier zelf «Прийняти / Aanvaarden» kies; «Відхилити / Afwijzen» meldt niets aan wie uitnodigde. Zelfstandig onderdeel: het staat
// in Instellingen en kan ook op het startscherm (zonder eigen woning) staan — zie HuisPagina.
import { useCallback, useEffect, useState } from 'react';
import { Check, MailOpen, X } from 'lucide-react';
import { HUIS_ROL_LABEL, HUIS_UITLEG, type UitnodigingVoorMij } from '../../../shared/huis-model';
import { HuisFout, huisClient } from '../huis-client';
import { datumTekst, foutTekst, tr, type Lang } from '../tekst';

type Props = { lang: Lang; toon: (t: string, soort?: 'ok' | 'fout') => void; naAanvaarden?: (woningId: string) => Promise<void> | void };

export default function UitnodigingenVoorMij({ lang, toon, naAanvaarden }: Props) {
  const [lijst, setLijst] = useState<UitnodigingVoorMij[] | null>(null);
  const [bezig, setBezig] = useState('');
  const laad = useCallback(async () => { try { setLijst(await huisClient.uitnodigingenVoorMij()); } catch { setLijst([]); } }, []);
  useEffect(() => { void laad(); }, [laad]);
  const fout = (e: unknown) => toon(foutTekst(lang, e instanceof HuisFout ? e.code : 'FOUT'), 'fout');
  const rolTekst = (rol: string) => { const p = HUIS_ROL_LABEL[rol]; return p ? tr(lang, p[0], p[1]) : rol; };
  const aanvaarden = async (u: UitnodigingVoorMij) => {
    setBezig(u.id);
    try {
      const r = await huisClient.uitnodigingAanvaarden(u.id);
      toon(tr(lang, `Ви тепер учасник оселі «${u.woningNaam}». Оберіть її у заголовку сторінки.`, `U bent nu lid van de woning «${u.woningNaam}». Kies ze in de kop van de pagina.`));
      await laad();
      await naAanvaarden?.(r.woningId);
    } catch (e) { fout(e); await laad(); } finally { setBezig(''); }
  };
  const afwijzen = async (u: UitnodigingVoorMij) => {
    if (!window.confirm(tr(lang, `Відхилити запрошення до оселі «${u.woningNaam}»? ${HUIS_UITLEG.UITNODIGING_AFWIJZEN[0]}`, `De uitnodiging voor de woning «${u.woningNaam}» afwijzen? ${HUIS_UITLEG.UITNODIGING_AFWIJZEN[1]}`))) return;
    setBezig(u.id);
    try { await huisClient.uitnodigingAfwijzen(u.id); toon(tr(lang, 'Запрошення відхилено.', 'Uitnodiging afgewezen.')); await laad(); }
    catch (e) { fout(e); await laad(); } finally { setBezig(''); }
  };
  if (!lijst || !lijst.length) return null; // niets uitgenodigd: geen leeg blok
  return (
    <section className='hv-blok' aria-labelledby='hv-uitn-mij' data-hv-uitnodigingen-mij={lijst.length}>
      <h3 id='hv-uitn-mij'><MailOpen aria-hidden='true' /> {tr(lang, 'Запрошення для вас', 'Uitnodigingen voor u')}</h3>
      <ul className='hv-lijst is-dicht'>
        {lijst.map((u) => (
          <li key={u.id} data-hv-uitnodiging-mij={u.id}>
            <span>
              <strong>{u.woningNaam}</strong>{' '}
              <small>
                {tr(lang, 'запрошує', 'uitgenodigd door')} {u.doorNaam ? `${u.doorNaam} (${u.doorEmail})` : u.doorEmail} · {rolTekst(u.rol)}
                {u.lidGeldigTot ? ` · ${tr(lang, 'доступ до', 'toegang tot')} ${datumTekst(lang, u.lidGeldigTot, false)}` : ''}
                {` · ${tr(lang, 'запрошення діє до', 'uitnodiging geldig tot')} ${datumTekst(lang, u.verlooptOp, false)}`}
              </small>
            </span>
            <span className='hv-knoppen'>
              <button type='button' className='hv-knop is-klein is-hoofd' disabled={Boolean(bezig)} aria-busy={bezig === u.id || undefined} title={tr(lang, HUIS_UITLEG.UITNODIGING_AANVAARDEN[0], HUIS_UITLEG.UITNODIGING_AANVAARDEN[1])} onClick={() => void aanvaarden(u)} data-hv-uitnodiging-aanvaard={u.id}><Check aria-hidden='true' />{tr(lang, 'Прийняти', 'Aanvaarden')}</button>
              <button type='button' className='hv-knop is-klein' disabled={Boolean(bezig)} title={tr(lang, HUIS_UITLEG.UITNODIGING_AFWIJZEN[0], HUIS_UITLEG.UITNODIGING_AFWIJZEN[1])} onClick={() => void afwijzen(u)} data-hv-uitnodiging-afwijs={u.id}><X aria-hidden='true' />{tr(lang, 'Відхилити', 'Afwijzen')}</button>
            </span>
          </li>
        ))}
      </ul>
      <p className='hv-hint'>{tr(lang, HUIS_UITLEG.UITNODIGING_AANVAARDEN[0], HUIS_UITLEG.UITNODIGING_AANVAARDEN[1])} {tr(lang, HUIS_UITLEG.UITNODIGING_AFWIJZEN[0], HUIS_UITLEG.UITNODIGING_AFWIJZEN[1])}</p>
    </section>
  );
}
