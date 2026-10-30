// Kaart «SSH-сертифікати» in het technisch profiel (18.10.2026): stand van de CA, voorbereiden / aan / uit / ontmantelen,
// een certificaat van 5–60 minuten uitgeven, de lijst van uitgegeven certificaten en intrekken (KRL). De site doet zelf niets als
// root: elke knop is een verzoek dat root opnieuw controleert (passkey voor «voorbereiden» en «aan», `sshd -t` voor sshd).
import { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCw, ShieldCheck, ShieldOff, Wrench } from 'lucide-react';
import { Venster } from '../platform/vensters';
import { api } from '../platform/client';
import { foutCode, kanPasskey, passkeyBevestigen, type AssertieOpties } from '../platform/webauthn';
import { routeLang, serviceFromLocation } from '../canoniek-navigatie';
import { ecosystemTabContext } from '../tab-context';
import { zijbalkServerDienst } from '../zijbalk-voorkeuren';
import HulpVraag from '../hulp/HulpVraag';
import { publiekeSleutel, SSH_CA_DUREN, SSH_CA_MINUTEN, type SshCaCertRij, type SshCaStand } from '../../shared/ssh-ca';
import './ssh-beheer.css';

const basis = () => ({ service: zijbalkServerDienst() || serviceFromLocation(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
type T = readonly [string, string];
export const SSH_FOUTEN: Readonly<Record<string, T>> = Object.freeze({
  OWNER_REQUIRED: ['Лише власник керує SSH-сертифікатами.', 'Alleen de eigenaar beheert SSH-certificaten.'],
  TECH_SSH_CA_VEREIST: ['Потрібен активний технічний профіль Власника в цій вкладці.', 'Een actief technisch profiel van de eigenaar in dit tabblad is nodig.'],
  AGENT_NIET_TOEGESTAAN: ['Агент не може керувати SSH-сертифікатами.', 'Een agent kan SSH-certificaten niet beheren.'],
  SSH_CA_PASSKEY_VEREIST: ['Потрібне підтвердження passkey.', 'Een bevestiging met passkey is nodig.'],
  SSH_CA_PASSKEY: ['Root не підтвердив passkey — нічого не змінено.', 'Root heeft de passkey niet bevestigd — niets gewijzigd.'],
  GEEN_PASSKEY: ['На сервері ще немає passkey власника (mijn-ruimte-passkey toevoegen).', 'Er staat nog geen passkey van de eigenaar op de server (mijn-ruimte-passkey toevoegen).'],
  UITDAGING_ONGELDIG: ['Підтвердження застаріло або вже використане. Спробуйте ще раз.', 'De bevestiging is verlopen of al gebruikt. Probeer het opnieuw.'],
  SSH_CA_SLEUTEL: ['Вставте один публічний ключ ssh-ed25519, без коментаря й без налаштувань.', 'Plak één publieke ssh-ed25519-sleutel, zonder commentaar en zonder opties.'],
  SSH_CA_UIT: ['Підпис вимкнено. Спершу «Підготувати», потім «Увімкнути».', 'Ondertekenen staat uit. Eerst «Voorbereiden», dan «Aanzetten».'],
  SSH_CA_NIET_GEREED: ['Спершу «Підготувати»: CA-ключ і довіра sshd.', 'Eerst «Voorbereiden»: CA-sleutel en sshd-vertrouwen.'],
  SSH_CA_DUUR: ['Термін — від 5 до 60 хвилин.', 'De geldigheid is 5 tot 60 minuten.'],
  SSH_CA_PRINCIPAL: ['Сервер не дозволяє цей доступ (principal).', 'De server staat deze toegang (principal) niet toe.'],
  SSH_CA_LIMIET: ['За цю годину вже видано надто багато сертифікатів.', 'Er zijn dit uur al te veel certificaten uitgegeven.'],
  SSH_CA_TE_OUD: ['Запит застарів. Спробуйте ще раз.', 'Het verzoek is te oud. Probeer het opnieuw.'],
  SSH_CA_GEEN_ANTWOORD: ['Root-служба не відповіла (mijn-ruimte-ssh-ca-beheer). Перевірте, чи встановлено останню версію.', 'De root-dienst antwoordde niet (mijn-ruimte-ssh-ca-beheer). Controleer of de laatste versie is geïnstalleerd.'],
  SSH_CA_SERIE: ['Некоректний серійний номер.', 'Ongeldig serienummer.'],
  SSH_CA_SERIE_ONBEKEND: ['Цей сертифікат не знайдено або його вже відкликано.', 'Dit certificaat is niet gevonden of al ingetrokken.'],
  SSH_CA_CONTROLE: ['Відповідь не пройшла перевірку. Нічого не змінено.', 'Het antwoord kwam niet door de controle. Niets gewijzigd.'],
});
const tekst = (code: string, uk: boolean, root?: { uk?: string; nl?: string }) => {
  if (root && (uk ? root.uk : root.nl)) return String(uk ? root.uk : root.nl);
  const f = SSH_FOUTEN[code];
  if (f) return uk ? f[0] : f[1];
  if (/STEP_UP|STAP_OP/.test(code)) return uk ? 'Вхід не підтверджено — нічого не змінено.' : 'Aanmelding niet bevestigd — niets gewijzigd.';
  if (/^PASSKEY_|NotAllowedError|AbortError/.test(code)) return uk ? 'Passkey не підтверджено — нічого не змінено.' : 'Passkey niet bevestigd — niets gewijzigd.';
  return `${uk ? 'Не вдалося' : 'Mislukt'} (${code}).`;
};
type Antwoord = { ok: boolean; code: string; uk?: string; nl?: string; detail?: string; stand?: SshCaStand };
type Uit = { cert: string; geldigTot: string; vinger: string; principal: string; principals?: string[]; minuten: number; serie: number | null };

const datum = (iso: string, uk: boolean) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleString(uk ? 'uk-UA' : 'nl-NL', { dateStyle: 'short', timeStyle: 'short' }) : '—'; };

function Kenmerk({ aan, ja, nee, uk, hulp, id }: { aan: boolean; ja: T; nee: T; uk: boolean; hulp?: string; id: string }) {
  return (
    <li className={`ssh-kenmerk${aan ? ' is-aan' : ''}`} data-ssh-kenmerk={id} data-aan={aan ? '1' : '0'}>
      <span className='ssh-stip' aria-hidden='true' />
      <span>{uk ? (aan ? ja[0] : nee[0]) : (aan ? ja[1] : nee[1])}</span>
      {hulp ? <HulpVraag k={hulp} uk={uk} label={uk ? ja[0] : ja[1]} /> : null}
    </li>
  );
}

export default function SshBeheer({ sluit }: { sluit: () => void }) {
  const uk = routeLang() !== 'nl';
  const [stand, setStand] = useState<SshCaStand | null>(null);
  const [lijst, setLijst] = useState<SshCaCertRij[]>([]);
  const [bezig, setBezig] = useState('');
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string; detail?: string } | null>(null);
  const [publiek, setPubliek] = useState('');
  const [minuten, setMinuten] = useState<number>(SSH_CA_MINUTEN);
  const [uit, setUit] = useState<Uit | null>(null);
  const [intrekVraag, setIntrekVraag] = useState<number | null>(null);

  const laad = useCallback(async (vernieuwen = false) => {
    try { setStand(((await api.post('/api/ssh-ca/stand', { ...basis(), vernieuwen })).data as { stand: SshCaStand | null }).stand); } catch (e) { setMelding({ ok: false, tekst: tekst(foutCode(e) || String((e as Error).message), uk) }); }
    try { setLijst(((await api.post('/api/ssh-ca/lijst', basis())).data as { certificaten: SshCaCertRij[] }).certificaten || []); } catch { /* stand-melding volstaat */ }
  }, [uk]);
  useEffect(() => { void laad(true); }, [laad]);

  const meld = (r: Antwoord, okTekst: T) => {
    if (r.stand) setStand(r.stand);
    setMelding(r.ok ? { ok: true, tekst: uk ? okTekst[0] : okTekst[1] } : { ok: false, tekst: tekst(r.code, uk, r), detail: r.detail });
  };
  const actie = async (soort: 'inrichten' | 'aan' | 'uit' | 'ontmantelen', okTekst: T) => {
    setBezig(soort); setMelding(null);
    try {
      let extra: Record<string, unknown> = {};
      if (soort === 'inrichten' || soort === 'aan') {
        if (!kanPasskey()) throw new Error('NotAllowedError');
        const c = (await api.post('/api/ssh-ca/beheer/uitdaging', { ...basis(), actie: soort })).data as { uitdagingId: string; publicKey: AssertieOpties };
        extra = { uitdagingId: c.uitdagingId, assertie: await passkeyBevestigen(c.publicKey) };
      }
      meld((await api.post('/api/ssh-ca/beheer', { ...basis(), actie: soort, ...extra })).data as Antwoord, okTekst);
    } catch (e) { setMelding({ ok: false, tekst: tekst(foutCode(e) || String((e as Error).message), uk) }); }
    finally { setBezig(''); void laad(false); }
  };
  const uitgeven = async () => {
    setBezig('uitgifte'); setMelding(null);
    try { setUit((await api.post('/api/ssh-ca/uitgifte', { ...basis(), publiek: publiek.trim(), minuten })).data as Uit); void laad(false); }
    catch (e) { setMelding({ ok: false, tekst: tekst(foutCode(e) || String((e as Error).message), uk) }); }
    finally { setBezig(''); }
  };
  const intrekken = async (serie: number) => {
    setBezig(`intrekken-${serie}`); setMelding(null); setIntrekVraag(null);
    try { meld((await api.post('/api/ssh-ca/intrekken', { ...basis(), series: [serie] })).data as Antwoord, [`Сертифікат №${serie} відкликано — sshd відмовить йому одразу.`, `Certificaat nr. ${serie} ingetrokken — sshd weigert het meteen.`]); }
    catch (e) { setMelding({ ok: false, tekst: tekst(foutCode(e) || String((e as Error).message), uk) }); }
    finally { setBezig(''); void laad(false); }
  };
  const kopieer = async () => {
    if (!uit) return;
    try { await navigator.clipboard.writeText(uit.cert); setMelding({ ok: true, tekst: uk ? 'Сертифікат скопійовано.' : 'Certificaat gekopieerd.' }); }
    catch { setMelding({ ok: false, tekst: uk ? 'Скопіюйте текст із поля вручну.' : 'Kopieer de tekst uit het veld met de hand.' }); }
  };

  const s = stand;
  const gereed = !!s?.ca && !!s?.sshdVertrouwt;
  const geldig = !!publiekeSleutel(publiek);
  return (
    <Venster id='ssh-beheer' titel={uk ? 'SSH-сертифікати' : 'SSH-certificaten'} breedte={640} onSluit={sluit}>
      <div className='tech-venster ssh-beheer' data-ssh-beheer='1'>
        <p className='tech-lead'>{uk
          ? 'Короткоживучі сертифікати SSH для входу на сервер як beheer, без постійного ключа. Усі зміни виконує root і записує в журнал.'
          : 'Kortlevende SSH-certificaten om als beheer op de server in te loggen, zonder vaste sleutel. Alle wijzigingen voert root uit en zet hij in het logboek.'} <HulpVraag k='ssh.certificaat' uk={uk} label={uk ? 'SSH-сертифікати' : 'SSH-certificaten'} /></p>

        <section className='ssh-blok' aria-labelledby='ssh-stand-kop'>
          <h3 id='ssh-stand-kop'>{uk ? 'Стан' : 'Stand'} <HulpVraag k='ssh.stand' meer={[['ssh.intrekken', 'Відкликання (KRL)', 'Intrekken (KRL)']]} uk={uk} label={uk ? 'Стан' : 'Stand'} /></h3>
          {s ? (
            <ul className='ssh-kenmerken' data-ssh-stand='1'>
              <Kenmerk id='ca' aan={s.ca} uk={uk} ja={['CA-ключ є', 'CA-sleutel aanwezig']} nee={['CA-ключа немає', 'Geen CA-sleutel']} />
              <Kenmerk id='sshd' aan={s.sshdVertrouwt} uk={uk} ja={['sshd довіряє CA', 'sshd vertrouwt de CA']} nee={['sshd не довіряє CA', 'sshd vertrouwt de CA niet']} />
              <Kenmerk id='krl' aan={s.krl} uk={uk} ja={[`Відкликання діє (KRL: ${s.ingetrokken})`, `Intrekken actief (KRL: ${s.ingetrokken})`]} nee={['Список відкликаних не підключено', 'Intrekkingslijst niet actief']} />
              <Kenmerk id='schakelaar' aan={s.schakelaar} uk={uk} ja={['Підпис увімкнено', 'Ondertekenen staat aan']} nee={['Підпис вимкнено', 'Ondertekenen staat uit']} />
              {!s.include ? <Kenmerk id='include' aan={false} uk={uk} ja={['', '']} nee={['sshd_config не підключає sshd_config.d — додайте Include вручну', 'sshd_config neemt sshd_config.d niet op — voeg Include met de hand toe']} /> : null}
            </ul>
          ) : <p className='tech-meta' data-ssh-stand='0'>{uk ? 'Стан ще невідомий — root-служба не відповіла.' : 'Stand nog onbekend — de root-dienst antwoordde niet.'}</p>}
          {s?.vinger ? <p className='tech-meta ssh-vinger'>{s.vinger}{s.bijgewerkt ? ` · ${datum(s.bijgewerkt, uk)}` : ''}</p> : null}
          <div className='tech-knoppen'>
            <button type='button' onClick={() => void laad(true)} disabled={!!bezig} data-ssh-actie='vernieuwen'><RefreshCw aria-hidden='true' />{uk ? 'Оновити' : 'Vernieuwen'}</button>
          </div>
        </section>

        <section className='ssh-blok' aria-labelledby='ssh-acties-kop'>
          <h3 id='ssh-acties-kop'>{uk ? 'Керування' : 'Beheer'} <HulpVraag k='ssh.voorbereiden' naam={['Підготувати', 'Voorbereiden']} meer={[['ssh.schakelaar', 'Перемикач підпису', 'Ondertekenschakelaar'], ['ssh.ontmantelen', 'Прибрати довіру sshd', 'sshd-vertrouwen weghalen']]} uk={uk} label={uk ? 'Керування' : 'Beheer'} /></h3>
          <div className='ssh-acties'>
            <span className='ssh-actie'>
              <button type='button' className={gereed ? '' : 'is-hoofd'} disabled={!!bezig} aria-busy={bezig === 'inrichten' || undefined} onClick={() => void actie('inrichten', ['Готово: CA-ключ, KRL і довіра sshd (sshd -t пройдено).', 'Klaar: CA-sleutel, KRL en sshd-vertrouwen (sshd -t geslaagd).'])} data-ssh-actie='inrichten'><Wrench aria-hidden='true' />{uk ? 'Підготувати' : 'Voorbereiden'}</button>
            </span>
            <span className='ssh-actie ssh-schakelaar'>
              <button type='button' role='switch' data-hulp='ssh.schakelaar' aria-checked={!!s?.schakelaar} className={s?.schakelaar ? 'is-aan' : ''} disabled={!!bezig || (!s?.schakelaar && !gereed)}
                onClick={() => void (s?.schakelaar ? actie('uit', ['Підпис вимкнено.', 'Ondertekenen staat uit.']) : actie('aan', ['Підпис увімкнено.', 'Ondertekenen staat aan.']))} data-ssh-actie={s?.schakelaar ? 'uit' : 'aan'}>
                <span className='ssh-schuif' aria-hidden='true' />{s?.schakelaar ? (uk ? 'Увімкнено — вимкнути' : 'Aan — uitzetten') : (uk ? 'Вимкнено — увімкнути (passkey)' : 'Uit — aanzetten (passkey)')}
              </button>
            </span>
            {s?.dropin ? (
              <span className='ssh-actie'>
                <button type='button' className='is-gevaar' disabled={!!bezig} onClick={() => void actie('ontmantelen', ['Довіру sshd до CA прибрано; підпис вимкнено.', 'sshd-vertrouwen in de CA weggehaald; ondertekenen uit.'])} data-ssh-actie='ontmantelen'><ShieldOff aria-hidden='true' />{uk ? 'Прибрати довіру sshd' : 'sshd-vertrouwen weghalen'}</button>
              </span>
            ) : null}
          </div>
        </section>

        <section className='ssh-blok' aria-labelledby='ssh-uitgifte-kop'>
          <h3 id='ssh-uitgifte-kop'><KeyRound aria-hidden='true' />{uk ? 'Видати сертифікат' : 'Certificaat uitgeven'} <HulpVraag k='ssh.duur' naam={['Термін дії', 'Geldigheid']} uk={uk} label={uk ? 'Видати сертифікат' : 'Certificaat uitgeven'} /></h3>
          {uit ? (
            <>
              <p className='tech-melding is-ok' data-ssh-ok='1'>{uk ? `№${uit.serie ?? '—'} · ${(uit.principals || [uit.principal]).join(', ')} · ${uit.minuten} хв · до ${uit.geldigTot.replace('T', ' ')}` : `nr. ${uit.serie ?? '—'} · ${(uit.principals || [uit.principal]).join(', ')} · ${uit.minuten} min · tot ${uit.geldigTot.replace('T', ' ')}`}</p>
              <label className='tech-veld'><span>{uk ? 'Сертифікат' : 'Certificaat'}</span><textarea readOnly rows={4} value={uit.cert} data-ssh-cert='1' /></label>
              <div className='tech-knoppen'>
                <button type='button' className='is-hoofd' onClick={() => void kopieer()} data-ssh-kopieer='1'>{uk ? 'Копіювати' : 'Kopiëren'}</button>
                <button type='button' onClick={() => { setUit(null); setPubliek(''); }}>{uk ? 'Ще один' : 'Nog een'}</button>
              </div>
              <p className='tech-meta'>{uk ? 'Збережіть як ~/.ssh/id_ed25519-cert.pub поруч із приватним ключем і підключіться: ssh beheer@<сервер>.' : 'Bewaar als ~/.ssh/id_ed25519-cert.pub naast de privésleutel en maak verbinding: ssh beheer@<server>.'}</p>
            </>
          ) : (
            <form className='ssh-uitgifte' onSubmit={(e) => { e.preventDefault(); if (!bezig && geldig) void uitgeven(); }}>
              <label className='tech-veld'><span>{uk ? 'Публічний ключ' : 'Publieke sleutel'}</span>
                <textarea rows={3} value={publiek} onChange={(e) => setPubliek(e.target.value)} spellCheck={false} autoComplete='off' placeholder='ssh-ed25519 AAAA…' data-ssh-publiek='1' /></label>
              <label className='tech-veld'><span>{uk ? 'Термін дії' : 'Geldigheid'}</span>
                <select data-hulp='ssh.duur' value={minuten} onChange={(e) => setMinuten(Number(e.target.value))} data-ssh-minuten='1'>
                  {SSH_CA_DUREN.map((m) => <option key={m} value={m}>{m} {uk ? 'хв' : 'min'}</option>)}
                </select></label>
              <div className='tech-knoppen'>
                <button type='submit' className='is-hoofd' disabled={!!bezig || !geldig || !s?.schakelaar} aria-busy={bezig === 'uitgifte' || undefined} data-ssh-uitgifte='1'><KeyRound aria-hidden='true' />{bezig === 'uitgifte' ? (uk ? 'Зачекайте…' : 'Even geduld…') : (uk ? `Видати на ${minuten} хв` : `Uitgeven voor ${minuten} min`)}</button>
              </div>
              {!s?.schakelaar ? <p className='tech-meta'>{uk ? 'Видача доступна, коли підпис увімкнено.' : 'Uitgeven kan zodra ondertekenen aan staat.'}</p> : null}
            </form>
          )}
        </section>

        <section className='ssh-blok' aria-labelledby='ssh-lijst-kop'>
          <h3 id='ssh-lijst-kop'>{uk ? 'Видані сертифікати' : 'Uitgegeven certificaten'} <HulpVraag k='ssh.lijst' uk={uk} label={uk ? 'Видані сертифікати' : 'Uitgegeven certificaten'} /></h3>
          {lijst.length ? (
            <ul className='ssh-lijst' data-ssh-lijst='1'>
              {lijst.map((c) => (
                <li key={c.serie} className={`ssh-cert${c.actief ? ' is-actief' : ''}${c.ingetrokken ? ' is-ingetrokken' : ''}`} data-ssh-serie={c.serie}>
                  <span className='ssh-cert-kop'><b>№{c.serie}</b><span className='ssh-cert-status'>{c.ingetrokken ? (uk ? 'відкликано' : 'ingetrokken') : c.actief ? (uk ? 'діє' : 'geldig') : (uk ? 'минув' : 'verlopen')}</span></span>
                  <span className='ssh-cert-rij'><span>{uk ? 'Ким' : 'Door'}</span>{c.door}</span>
                  <span className='ssh-cert-rij'><span>{uk ? 'Коли' : 'Wanneer'}</span>{datum(c.aangemaakt, uk)}</span>
                  <span className='ssh-cert-rij'><span>{uk ? 'До' : 'Tot'}</span>{datum(c.geldigTot, uk)} ({c.minuten} {uk ? 'хв' : 'min'})</span>
                  <span className='ssh-cert-rij'><span>Principals</span>{c.principals.join(', ')}</span>
                  {c.ingetrokken ? <span className='ssh-cert-rij'><span>{uk ? 'Відкликав' : 'Ingetrokken door'}</span>{c.ingetrokkenDoor} · {datum(c.ingetrokken, uk)}</span> : null}
                  {c.actief ? (
                    intrekVraag === c.serie ? (
                      <span className='tech-knoppen'>
                        <button type='button' className='is-gevaar' disabled={!!bezig} onClick={() => void intrekken(c.serie)} data-ssh-intrekken-bevestig={c.serie}><ShieldCheck aria-hidden='true' />{uk ? 'Так, відкликати' : 'Ja, intrekken'}</button>
                        <button type='button' onClick={() => setIntrekVraag(null)}>{uk ? 'Скасувати' : 'Annuleren'}</button>
                      </span>
                    ) : <span className='tech-knoppen'><button type='button' className='is-gevaar' disabled={!!bezig} onClick={() => setIntrekVraag(c.serie)} data-ssh-intrekken={c.serie}>{uk ? 'Відкликати' : 'Intrekken'}</button></span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : <p className='tech-meta'>{uk ? 'Ще нічого не видано.' : 'Nog niets uitgegeven.'}</p>}
        </section>

        {melding ? <p className={`tech-melding${melding.ok ? ' is-ok' : ''}`} role={melding.ok ? 'status' : 'alert'} data-ssh-melding='1'>{melding.tekst}{melding.detail ? <code className='ssh-detail'>{melding.detail}</code> : null}</p> : null}
        <div className='tech-knoppen'><button type='button' onClick={sluit}>{uk ? 'Закрити' : 'Sluiten'}</button></div>
      </div>
    </Venster>
  );
}
