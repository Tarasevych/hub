// Certificaat SSH van één uur. De privésleutel komt hier niet: alleen de publieke regel, en root tekent.
import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Venster } from '../platform/vensters';
import { api } from '../platform/client';
import { routeLang, serviceFromLocation } from '../canonical-navigation';
import { ecosystemTabContext } from '../tab-context';
import { zijbalkServerDienst } from '../zijbalk-voorkeuren';
import Vraag from '../tech/Vraag';
import { HELP_SSH, publiekeSleutel } from '../../shared/ssh-ca';

const body = () => ({ service: zijbalkServerDienst() || serviceFromLocation(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const FOUTEN: Record<string, [string, string]> = {
  TECH_SSH_CA_VEREIST: ['Сертифікат SSH на сервер видається лише з активного технічного профілю Власника.', 'Een SSH-certificaat voor de server krijgt alleen een actief technisch profiel van de eigenaar.'],
  SSH_CA_SLEUTEL: ['Вставте один публічний ключ ssh-ed25519, без коментаря й без налаштувань.', 'Plak één publieke ssh-ed25519-sleutel, zonder commentaar en zonder opties.'],
  SSH_CA_UIT: ['Підпис на сервері вимкнено. Root вмикає перемикач ssh-ca після inrichten і рядка в sshd.', 'Ondertekenen staat uit op de server. Root zet schakelaar ssh-ca aan na inrichten en een regel in sshd.'],
  SSH_CA_NIET_GEREED: ['CA ще немає. На сервері: sudo mijn-ruimte-ssh-ca inrichten', 'De CA bestaat nog niet. Op de server: sudo mijn-ruimte-ssh-ca inrichten'],
  SSH_CA_LIMIET: ['За цю годину вже видано надто багато сертифікатів.', 'Er zijn dit uur al te veel certificaten uitgegeven.'],
  SSH_CA_TE_OUD: ['Запит застарів. Спробуйте ще раз.', 'Het verzoek is te oud. Probeer het opnieuw.'],
  SSH_CA_GEEN_ANTWOORD: ['Служба підпису не відповіла. Перемикач або path-unit ще не увімкнені.', 'De ondertekendienst antwoordde niet. De schakelaar of de path-unit staat nog uit.'],
  SSH_CA_CONTROLE: ['Сертифікат не пройшов перевірку. Нічого не видано.', 'Het certificaat kwam niet door de controle. Er is niets uitgegeven.'],
};
const foutTekst = (e: unknown, uk: boolean) => { const c = String((e as Error)?.message || 'FOUT'); const f = FOUTEN[c]; return f ? (uk ? f[0] : f[1]) : /STEP_UP|STAP_OP/.test(c) ? (uk ? 'Вхід не підтверджено — сертифікат не видано.' : 'Aanmelding niet bevestigd — geen certificaat uitgegeven.') : `${uk ? 'Не вдалося' : 'Mislukt'} (${c}).`; };

type Uit = { cert: string; geldigTot: string; vinger: string; principal: string; minuten: number };

export default function SshCertificaat({ sluit }: { sluit: () => void }) {
  const uk = routeLang() !== 'nl';
  const [publiek, setPubliek] = useState('');
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState('');
  const [uit, setUit] = useState<Uit | null>(null);
  const geldig = !!publiekeSleutel(publiek);
  const doe = async () => {
    setBezig(true); setMelding('');
    try { setUit((await api.post('/api/ssh-ca/uitgifte', { ...body(), publiek: publiek.trim() })).data as Uit); }
    catch (e) { setMelding(foutTekst(e, uk)); }
    finally { setBezig(false); }
  };
  const kopieer = async () => {
    if (!uit) return;
    try { await navigator.clipboard.writeText(uit.cert); setMelding(uk ? 'Сертифікат скопійовано.' : 'Certificaat gekopieerd.'); }
    catch { setMelding(uk ? 'Скопіюйте текст із поля вручну.' : 'Kopieer de tekst uit het veld met de hand.'); }
  };
  return (
    <Venster id='ssh-certificaat' titel={uk ? 'Сертифікат SSH' : 'SSH-certificaat'} breedte={560} onSluit={sluit}>
      <form className='tech-venster' data-ssh-venster='1' onSubmit={(e) => { e.preventDefault(); if (!bezig && geldig) void doe(); }}>
        <p className='tech-lead'>{uk
          ? 'Вхід по SSH на цей сервер на одну годину, без постійного ключа. Приватний ключ лишається у вас.'
          : 'SSH naar deze server voor één uur, zonder vaste sleutel. De privésleutel blijft bij u.'} <Vraag help={HELP_SSH} uk={uk} label={uk ? 'Сертифікат SSH' : 'SSH-certificaat'} /></p>
        {uit ? (
          <>
            <p className='tech-melding is-ok' data-ssh-ok='1'>{uk ? `Дійсний до ${uit.geldigTot.replace('T', ' ')} UTC. Користувач ${uit.principal}, ${uit.minuten} хв.` : `Geldig tot ${uit.geldigTot.replace('T', ' ')} UTC. Gebruiker ${uit.principal}, ${uit.minuten} min.`}</p>
            <p className='tech-meta'>{uit.vinger}</p>
            <label className='tech-veld'><span>{uk ? 'Сертифікат' : 'Certificaat'}</span>
              <textarea readOnly rows={4} value={uit.cert} data-ssh-cert='1' /></label>
            <div className='tech-knoppen'>
              <button type='button' className='is-hoofd' onClick={() => void kopieer()} data-ssh-kopieer='1'>{uk ? 'Копіювати' : 'Kopiëren'}</button>
              <button type='button' onClick={sluit}>{uk ? 'Закрити' : 'Sluiten'}</button>
            </div>
            <p className='tech-meta'>{uk
              ? 'На своєму комп’ютері збережіть цей рядок як ~/.ssh/id_ed25519-cert.pub (поруч із приватним ключем id_ed25519) і підключіться: ssh beheer@<сервер>. SSH підхопить сертифікат сам; через годину він перестане діяти.'
              : 'Bewaar deze regel op uw computer als ~/.ssh/id_ed25519-cert.pub (naast de privésleutel id_ed25519) en maak verbinding: ssh beheer@<server>. SSH neemt het certificaat zelf mee; na een uur werkt het niet meer.'}</p>
          </>
        ) : (
          <>
            <label className='tech-veld'><span>{uk ? 'Публічний ключ' : 'Publieke sleutel'}</span>
              <textarea rows={3} value={publiek} onChange={(e) => setPubliek(e.target.value)} spellCheck={false} autoComplete='off' placeholder='ssh-ed25519 AAAA…' data-ssh-publiek='1' /></label>
            <div className='tech-knoppen'>
              <button type='submit' className='is-hoofd' disabled={bezig || !geldig} aria-busy={bezig || undefined} data-ssh-uitgifte='1'><KeyRound aria-hidden='true' />{bezig ? (uk ? 'Зачекайте…' : 'Even geduld…') : (uk ? 'Видати на 1 годину' : 'Uitgeven voor 1 uur')}</button>
            </div>
          </>
        )}
        {melding ? <p className='tech-melding' role='alert' data-ssh-melding='1'>{melding}</p> : null}
      </form>
    </Venster>
  );
}
