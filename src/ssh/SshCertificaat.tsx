// Certificaat SSH van één uur. De privésleutel komt hier niet: alleen de publieke regel, en root tekent.
import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Venster } from '../platform/vensters';
import { api } from '../platform/client';
import { foutCode, kanPasskey, passkeyBevestigen, type AssertieOpties } from '../platform/webauthn';
import { routeLang, serviceFromLocation } from '../canoniek-navigatie';
import { ecosystemTabContext } from '../tab-context';
import { zijbalkServerDienst } from '../zijbalk-voorkeuren';
import Vraag from '../tech/Vraag';
import { HELP_SSH, publiekeSleutel } from '../../shared/ssh-ca';

const body = () => ({ service: zijbalkServerDienst() || serviceFromLocation(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
type Uit = { cert: string; geldigTot: string; vinger: string; principal: string; principals?: string[]; minuten: number; serie?: number | null };

/**
 * SEC-002 (server-uitrol-06): een certificaat aanvragen in twee stappen. Root tekent alleen met een passkey van de eigenaar over
 * PRECIES deze sleutel en duur: eerst de challenge halen, dan de passkey vragen, dan pas de uitgifte. Staat de controle op de
 * server bewust uit (root: "ssh-ca-teken-passkey": false), dan zegt de server `passkeyNodig: false` en vervalt de passkey-stap.
 * Elk venster dat certificaten uitgeeft gebruikt deze ene functie.
 */
export async function sshCertificaatAanvragen(basis: Record<string, unknown>, publiek: string, minuten?: number): Promise<Uit> {
  const duur = minuten ? { minuten } : {};
  const c = (await api.post('/api/ssh-ca/uitgifte/uitdaging', { ...basis, publiek, ...duur })).data as { passkeyNodig: boolean; uitdagingId?: string; origins?: string[]; publicKey?: AssertieOpties };
  let passkey: Record<string, unknown> = {};
  if (c.passkeyNodig) {
    // SEC-002 (зауваження 1): root aanvaardt de passkey alleen op de origins uit zijn sleutelbestand (admin.*/id.*). Elders zou de
    // browser de passkey wel vragen, maar de handtekening wordt geweigerd — dus eerst eerlijk zeggen waar het wel kan.
    if (Array.isArray(c.origins) && c.origins.length && !c.origins.includes(location.origin)) throw Object.assign(new Error('SSH_CA_ORIGIN'), { code: 'SSH_CA_ORIGIN' });
    if (!kanPasskey() || !c.publicKey) throw Object.assign(new Error('NotAllowedError'), { name: 'NotAllowedError' });
    passkey = { uitdagingId: c.uitdagingId, assertie: await passkeyBevestigen(c.publicKey) };
  }
  return (await api.post('/api/ssh-ca/uitgifte', { ...basis, publiek, ...duur, ...passkey })).data as Uit;
}

// Ook gebruikt door de kaart «SSH-сертифікати» (SshBeheer): één bron voor de teksten van de uitgifte.
export const FOUTEN: Record<string, [string, string]> = {
  // SEC-002 (зауваження 1): passkey voor de SSH-CA alleen op admin/id; elders een uitleg met de weg erheen, geen algemene fout.
  SSH_CA_ORIGIN: ['Видача сертифіката з passkey можлива лише на https://admin.tarasevych.com або https://id.tarasevych.com. Відкрийте технічний шар там і повторіть — нічого не витрачено.', 'Een certificaat met passkey kan alleen op https://admin.tarasevych.com of https://id.tarasevych.com. Open daar de technische laag en probeer opnieuw — er is niets verbruikt.'],
  PASSKEY_ORIGIN_ONJUIST: ['Passkey підтверджено не на тій адресі: root приймає його лише на https://admin.tarasevych.com або https://id.tarasevych.com. Повторіть видачу там.', 'De passkey is op het verkeerde adres bevestigd: root aanvaardt hem alleen op https://admin.tarasevych.com of https://id.tarasevych.com. Vraag het certificaat daar opnieuw aan.'],
  SSH_CA_PASSKEY_VEREIST: ['Потрібне підтвердження passkey саме для цього ключа — сертифікат не видано.', 'Een bevestiging met passkey voor precies deze sleutel is nodig — geen certificaat uitgegeven.'],
  SSH_CA_PASSKEY: ['Root не підтвердив passkey власника — сертифікат не підписано.', 'Root heeft de passkey van de eigenaar niet bevestigd — geen certificaat getekend.'],
  GEEN_PASSKEY: ['На сервері ще немає passkey власника для схвалень. Додайте його в розділі оновлень (або root: mijn-ruimte-passkey toevoegen).', 'Er staat nog geen passkey van de eigenaar voor goedkeuringen op de server. Voeg hem toe bij de updates (of root: mijn-ruimte-passkey toevoegen).'],
  UITDAGING_ONGELDIG: ['Підтвердження застаріло або вже використане. Спробуйте ще раз.', 'De bevestiging is verlopen of al gebruikt. Probeer het opnieuw.'],
  TECH_SSH_CA_VEREIST: ['Сертифікат SSH на сервер видається лише з активного технічного профілю Власника.', 'Een SSH-certificaat voor de server krijgt alleen een actief technisch profiel van de eigenaar.'],
  SSH_CA_SLEUTEL: ['Вставте один публічний ключ ssh-ed25519, без коментаря й без налаштувань.', 'Plak één publieke ssh-ed25519-sleutel, zonder commentaar en zonder opties.'],
  SSH_CA_UIT: ['Підпис на сервері вимкнено. Root вмикає перемикач ssh-ca після inrichten і рядка в sshd.', 'Ondertekenen staat uit op de server. Root zet schakelaar ssh-ca aan na inrichten en een regel in sshd.'],
  SSH_CA_NIET_GEREED: ['CA ще немає. На сервері: sudo mijn-ruimte-ssh-ca inrichten', 'De CA bestaat nog niet. Op de server: sudo mijn-ruimte-ssh-ca inrichten'],
  SSH_CA_LIMIET: ['За цю годину вже видано надто багато сертифікатів.', 'Er zijn dit uur al te veel certificaten uitgegeven.'],
  SSH_CA_TE_OUD: ['Запит застарів. Спробуйте ще раз.', 'Het verzoek is te oud. Probeer het opnieuw.'],
  SSH_CA_GEEN_ANTWOORD: ['Служба підпису не відповіла. Перемикач або path-unit ще не увімкнені.', 'De ondertekendienst antwoordde niet. De schakelaar of de path-unit staat nog uit.'],
  SSH_CA_CONTROLE: ['Сертифікат не пройшов перевірку. Нічого не видано.', 'Het certificaat kwam niet door de controle. Er is niets uitgegeven.'],
};
const foutTekst = (e: unknown, uk: boolean) => {
  const c = foutCode(e) || String((e as Error)?.message || 'FOUT'); const f = FOUTEN[c];
  if (f) return uk ? f[0] : f[1];
  if (/STEP_UP|STAP_OP/.test(c)) return uk ? 'Вхід не підтверджено — сертифікат не видано.' : 'Aanmelding niet bevestigd — geen certificaat uitgegeven.';
  if (/^PASSKEY_|NotAllowedError|AbortError|TimeoutError/.test(c)) return uk ? 'Passkey не підтверджено — сертифікат не видано.' : 'Passkey niet bevestigd — geen certificaat uitgegeven.';
  return `${uk ? 'Не вдалося' : 'Mislukt'} (${c}).`;
};

export default function SshCertificaat({ sluit }: { sluit: () => void }) {
  const uk = routeLang() !== 'nl';
  const [publiek, setPubliek] = useState('');
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState('');
  const [uit, setUit] = useState<Uit | null>(null);
  const geldig = !!publiekeSleutel(publiek);
  const doe = async () => {
    setBezig(true); setMelding('');
    try { setUit(await sshCertificaatAanvragen(body(), publiek.trim())); }
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
          ? 'Вхід по SSH на цей сервер на одну годину, без постійного ключа. Приватний ключ лишається у вас. Перед видачею сервер попросить ваш passkey саме для цього ключа: без нього root сертифікат не підпише.'
          : 'SSH naar deze server voor één uur, zonder vaste sleutel. De privésleutel blijft bij u. Vóór de uitgifte vraagt de server uw passkey voor precies deze sleutel: zonder die tekent root het certificaat niet.'} <Vraag help={HELP_SSH} uk={uk} label={uk ? 'Сертифікат SSH' : 'SSH-certificaat'} /></p>
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
