// Pakketten die op uw goedkeuring wachten: wie bereidde voor, wat verandert, tests; goedkeuren = WebAuthn-passkey (de server en root controleren opnieuw).
import { useState } from 'react';
import { Fingerprint, ShieldCheck, X } from 'lucide-react';
import { foutTekst } from './fouten';
import Voorcontrole from './Voorcontrole';
import CommitTekst from './CommitTekst';
import { datum, mb, tr, type Lang, type Overzicht, type Voorstel } from './types';

type Props = { lang: Lang; data: Overzicht; busy: string; klaar: boolean; goedkeuren: (v: Voorstel) => void; afwijzen: (v: Voorstel, reden: string) => void; verberg?: string };

export default function Goedkeuring({ lang, data, busy, klaar, goedkeuren, afwijzen, verberg }: Props) {
  // Het pakket dat de wizard «Нове оновлення» zelf net uploadde wordt daar (stap 4) getoond; hier alleen de rest (bv. door een agent voorbereid).
  const wachtenden = data.voorstellen.filter((v) => v.status === 'wacht-op-goedkeuring' && v.id !== verberg);
  const [afwijs, setAfwijs] = useState<{ id: string; reden: string } | null>(null);
  // Alleen tonen als er echt iets op goedkeuring wacht: een lege kaart met uitleg is ruis.
  if (wachtenden.length === 0) return null;
  return <section className='ut-kaart' data-ut-goedkeuring aria-labelledby='ut-goed-titel'>
    <header className='ut-kaart-kop'><div><h2 id='ut-goed-titel'><ShieldCheck aria-hidden='true' /> {tr(lang, 'Чекають схвалення', 'Wachten op goedkeuring')}{wachtenden.length > 0 && <span className='ut-teller'>{wachtenden.length}</span>}</h2>
      <p className='ut-sub'>{tr(lang, 'Схвалення діє лише для цього пакета (його sha256) і лише 5 хвилин. Сервер (root) перевіряє підпис passkey сам.', 'Een goedkeuring geldt alleen voor dit pakket (de sha256) en maar 5 minuten. De server (root) controleert de passkey-handtekening zelf.')}</p></div></header>
    {wachtenden.map((v) => <article key={v.id} className='ut-pakket' data-voorstel={v.id}>
      <h3>{tr(lang, 'Версія ', 'Versie ')}<span className='ut-mono'>{v.versie}</span></h3>
      <dl className='ut-dl'>
        <dt>{tr(lang, 'Підготував', 'Voorbereid door')}</dt><dd>{v.voorbereider} · {datum(lang, v.aangemaaktOp)}</dd>
        {v.pakketMeta?.auteur ? <><dt>{tr(lang, 'Автор у пакеті', 'Auteur in pakket')}</dt><dd>{v.pakketMeta.auteur}</dd></> : null}
        {v.pakketMeta?.agent ? <><dt>{tr(lang, 'Агент у пакеті', 'Agent in pakket')}</dt><dd>{v.pakketMeta.agent} <small>({tr(lang, 'зазначено самим пакетом', 'door het pakket zelf opgegeven')})</small></dd></> : null}
        <dt>{tr(lang, 'Коміт', 'Commit')}</dt><dd><CommitTekst lang={lang} commit={v.pakketMeta?.commit || v.commit} /></dd>
        <dt>{tr(lang, 'Тести', 'Tests')}</dt><dd data-ok={v.tests?.mislukt === 0}>{v.tests?.geslaagd != null ? tr(lang, `успішно ${v.tests.geslaagd}, з помилками ${v.tests.mislukt ?? '?'}`, `geslaagd ${v.tests.geslaagd}, mislukt ${v.tests.mislukt ?? '?'}`) : tr(lang, 'не вказано', 'niet opgegeven')}{v.tests?.samenvatting ? ` · ${v.tests.samenvatting}` : ''}</dd>
        <dt>{tr(lang, 'Розмір', 'Grootte')}</dt><dd>{mb(v.bytes)}</dd>
        <dt>sha256</dt><dd><code className='admin-uitrol-sha'>{v.sha256}</code></dd>
      </dl>
      {v.voorcontrole && <details open={!v.voorcontrole.ok}><summary>{tr(lang, 'Перевірка сайту', 'Voorcontrole van de site')}</summary><Voorcontrole lang={lang} v={v.voorcontrole} /></details>}
      {v.wijzigingen && <details open><summary>{tr(lang, 'Що змінено', 'Wat er verandert')}</summary><pre className='ut-pre'>{v.wijzigingen}</pre></details>}
      {v.diffSamenvatting && <details><summary>{tr(lang, 'Зміни у файлах', 'Gewijzigde bestanden')}</summary><pre className='ut-pre'>{v.diffSamenvatting}</pre></details>}
      <div className='ut-acties'>
        <button type='button' className='ut-knop ut-knop-primair' disabled={!klaar || !!busy} onClick={() => goedkeuren(v)}><Fingerprint aria-hidden='true' />{busy === `ok-${v.id}` ? tr(lang, 'Підтвердіть на телефоні…', 'Bevestig op uw telefoon…') : tr(lang, 'Схвалити й встановити', 'Goedkeuren en installeren')}</button>
        {afwijs?.id !== v.id && <button type='button' className='ut-knop ut-knop-gevaar' disabled={!!busy} onClick={() => setAfwijs({ id: v.id, reden: '' })}><X aria-hidden='true' />{tr(lang, 'Відхилити', 'Afwijzen')}</button>}
      </div>
      {afwijs?.id === v.id && <div className='ut-reden-veld' role='group' data-afwijzen-voorstel={v.id}>
        <label htmlFor={`afwijs-${v.id}`}>{tr(lang, 'Причина відхилення (необов’язково)', 'Reden van afwijzen (optioneel)')}</label>
        <textarea id={`afwijs-${v.id}`} rows={2} maxLength={500} value={afwijs.reden} onChange={(e) => setAfwijs({ id: v.id, reden: e.target.value })} disabled={!!busy} />
        <div className='ut-acties'>
          <button type='button' className='ut-knop ut-knop-gevaar' disabled={!!busy} onClick={() => { afwijzen(v, afwijs.reden.trim().slice(0, 500)); setAfwijs(null); }}><X aria-hidden='true' />{tr(lang, 'Відхилити версію', 'Versie afwijzen')}</button>
          <button type='button' className='ut-knop' disabled={!!busy} onClick={() => setAfwijs(null)}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
        </div>
      </div>}
      {!klaar && <p className='ut-hint'>{!data.schakelaar ? foutTekst(lang, 'PASSKEY_GOEDKEURING_UIT') : !data.passkeys.length ? foutTekst(lang, 'GEEN_PASSKEY') : tr(lang, 'Відкрийте цю сторінку в браузері з підтримкою passkey.', 'Open deze pagina in een browser die passkeys ondersteunt.')}</p>}
    </article>)}
  </section>;
}
