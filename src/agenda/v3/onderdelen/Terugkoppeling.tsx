// Meldingen bovenaan de agenda: laadfout (met laatste geslaagde verversing en «Повторити»), synchronisatiefout, de ruimte
// (technisch / gedeeld / gesloten) en een korte uitslag van de laatste actie. Nooit een lege agenda zonder uitleg.
import { AlertTriangle, CheckCircle2, Info, RefreshCw, X } from 'lucide-react';
import type { AgendaRuimte } from '../../agenda-client';
import { tr, taalcode, type Lang } from '../tekst';
import { ABONNEMENT_FOUT, foutCodeTekst } from '../../abonnement-fouten';

export function laadFoutTekst(lang: Lang, code: string): string {
  if (/OWNER_AGENDA_SESSIE_VEREIST|401|403/.test(code)) return tr(lang, 'Календар доступний лише після входу у ваш акаунт.', 'De agenda is alleen beschikbaar na aanmelden in uw account.');
  if (/Network|Failed to fetch|timeout|ECONN/i.test(code)) return tr(lang, 'Немає зв’язку з сервером.', 'Geen verbinding met de server.');
  return tr(lang, `Не вдалося оновити календар (${code}).`, `De agenda verversen is mislukt (${code}).`);
}

type Props = {
  lang: Lang; fout: string; syncFout: string; laatstGelukt: number | null; ruimte?: AgendaRuimte; bezig: boolean;
  melding: { ok: boolean; tekst: string } | null; onOpnieuw: () => void; onMeldingWeg: () => void; begrensd: boolean;
};
export default function Terugkoppeling({ lang, fout, syncFout, laatstGelukt, ruimte, bezig, melding, onOpnieuw, onMeldingWeg, begrensd }: Props) {
  const wanneer = laatstGelukt ? new Intl.DateTimeFormat(taalcode(lang), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(laatstGelukt)) : '';
  const probleem = fout || syncFout;
  return (
    <div className='agv-meldingen'>
      {probleem ? (
        <div className='agv-balk is-fout' role='alert' data-agenda-v3-fout={fout ? 'laden' : 'synchroniseren'}>
          <AlertTriangle aria-hidden='true' />
          <span>
            {fout ? laadFoutTekst(lang, fout) : ABONNEMENT_FOUT[syncFout] ? foutCodeTekst(syncFout, lang) : tr(lang, `Синхронізація не вдалася (${syncFout}).`, `Synchroniseren is mislukt (${syncFout}).`)}
            {' '}{wanneer ? tr(lang, `Показано дані станом на ${wanneer}.`, `U ziet de gegevens van ${wanneer}.`) : null}
          </span>
          <button type='button' className='agv-tekstknop' onClick={onOpnieuw} disabled={bezig} data-agenda-v3-opnieuw='1'>
            <RefreshCw aria-hidden='true' className={bezig ? 'agv-draai' : ''} />{tr(lang, 'Повторити', 'Opnieuw')}
          </button>
        </div>
      ) : null}
      {ruimte && ruimte.ok === false ? (
        <div className='agv-balk is-fout' role='alert' data-agenda-ruimte='gesloten' data-agenda-ruimte-code={ruimte.code}><Info aria-hidden='true' /><span>{tr(lang, ruimte.uitleg.uk, ruimte.uitleg.nl)}</span></div>
      ) : null}
      {ruimte && ruimte.ok === true && ruimte.ruimte === 'technisch' ? (
        <div className='agv-balk' role='status' data-agenda-ruimte='technisch'><Info aria-hidden='true' /><span>{tr(lang, 'Технічний простір: ', 'Technische ruimte: ')}{tr(lang, ruimte.uitleg.uk, ruimte.uitleg.nl)}</span></div>
      ) : null}
      {ruimte && ruimte.ok === true && ruimte.gedeeld ? (
        <div className='agv-balk' role='status' data-agenda-ruimte='gedeeld'><Info aria-hidden='true' /><span>{tr(lang, ruimte.uitleg.uk, ruimte.uitleg.nl)}</span></div>
      ) : null}
      {begrensd ? <div className='agv-balk' role='status'><Info aria-hidden='true' /><span>{tr(lang, 'Показано обмежену кількість подій.', 'Er wordt een begrensd aantal afspraken getoond.')}</span></div> : null}
      {melding ? (
        <div className={`agv-toast${melding.ok ? '' : ' is-fout'}`} role={melding.ok ? 'status' : 'alert'} data-agenda-melding='1'>
          {melding.ok ? <CheckCircle2 aria-hidden='true' /> : <AlertTriangle aria-hidden='true' />}<span>{melding.tekst}</span>
          <button type='button' className='agv-icoonknop' onClick={onMeldingWeg} aria-label={tr(lang, 'Закрити', 'Sluiten')}><X aria-hidden='true' /></button>
        </div>
      ) : null}
    </div>
  );
}
