// Pakketten die op uw goedkeuring wachten: wie bereidde voor, wat verandert, tests; goedkeuren = WebAuthn-passkey (de server en root controleren opnieuw).
import { useState } from 'react';
import { Fingerprint, ShieldCheck, X } from 'lucide-react';
import AfwijsVenster from './AfwijsVenster';
import { foutTekst } from './fouten';
import Voorcontrole from './Voorcontrole';
import CommitTekst from './CommitTekst';
import UitrolStroomKaart from './UitrolStroomKaart';
import RodeVlaggen, { rodeVlaggen } from './RodeVlaggen';
import { datum, lopendTekst, mb, tr, type Lang, type LopendeInstallatie, type Overzicht, type Voorstel } from './types';

export { afwijsRedenGeldig } from './AfwijsVenster';

type Props = { lang: Lang; context?: Record<string, unknown>; data: Overzicht; busy: string; klaar: boolean; goedkeuren: (v: Voorstel, risicoBevestigd?: boolean) => void; afwijzen: (v: Voorstel, reden: string) => void; verberg?: string; naarStroom?: (versie: string) => void;
  /** UITROL-002: er loopt al een installatie (run bezig of goedgekeurd pakket wacht op root) — goedkeuren staat dan uit. */ lopend?: LopendeInstallatie | null };

export default function Goedkeuring({ lang, context = {}, data, busy, klaar, goedkeuren, afwijzen, verberg, naarStroom, lopend }: Props) {
  // Het pakket dat de wizard «Нове оновлення» zelf net uploadde wordt daar (stap 4) getoond; hier alleen de rest (bv. door een agent voorbereid).
  const wachtenden = data.voorstellen.filter((v) => v.status === 'wacht-op-goedkeuring' && v.id !== verberg);
  const [afwijs, setAfwijs] = useState<{ id: string; reden: string } | null>(null);
  const [bevestigd, setBevestigd] = useState<Record<string, boolean>>({});
  // Alleen tonen als er echt iets op goedkeuring wacht: een lege kaart met uitleg is ruis.
  if (wachtenden.length === 0) return null;
  return <section className='ut-kaart' data-ut-goedkeuring aria-labelledby='ut-goed-titel'>
    <header className='ut-kaart-kop'><div><h2 id='ut-goed-titel'><ShieldCheck aria-hidden='true' /> {tr(lang, 'Чекають схвалення', 'Wachten op goedkeuring')}{wachtenden.length > 0 && <span className='ut-teller'>{wachtenden.length}</span>}</h2>
      <p className='ut-sub'>{tr(lang, 'Схвалення діє лише для цього пакета (його sha256) і лише 5 хвилин. Сервер (root) перевіряє підпис passkey сам.', 'Een goedkeuring geldt alleen voor dit pakket (de sha256) en maar 5 minuten. De server (root) controleert de passkey-handtekening zelf.')}</p></div></header>
    {wachtenden.map((v) => { const vlaggen = rodeVlaggen(v.voorcontrole); const rvOk = !vlaggen || !!bevestigd[v.id]; return <article key={v.id} className='ut-pakket' data-voorstel={v.id}>
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
      <UitrolStroomKaart lang={lang} context={context} versie={v.versie} compact naarStroom={naarStroom} />
      {v.wijzigingen && <details open><summary>{tr(lang, 'Що змінено', 'Wat er verandert')}</summary><pre className='ut-pre'>{v.wijzigingen}</pre></details>}
      {v.diffSamenvatting && <details><summary>{tr(lang, 'Зміни у файлах', 'Gewijzigde bestanden')}</summary><pre className='ut-pre'>{v.diffSamenvatting}</pre></details>}
      {vlaggen && <RodeVlaggen lang={lang} id={v.id} vlaggen={vlaggen} bevestigd={!!bevestigd[v.id]} onBevestig={(b) => setBevestigd((x) => ({ ...x, [v.id]: b }))} disabled={!!busy} />}
      <div className='ut-acties'>
        <button type='button' className='ut-knop ut-knop-primair' disabled={!klaar || !!busy || !!lopend || !rvOk} title={lopend ? lopendTekst(lang, lopend) : !rvOk ? tr(lang, 'Спершу перегляньте червоні прапорці й поставте позначку.', 'Bekijk eerst de rode vlaggen en zet het vinkje.') : undefined} onClick={() => goedkeuren(v, vlaggen ? true : undefined)}><Fingerprint aria-hidden='true' />{busy === `ok-${v.id}` ? tr(lang, 'Підтвердіть на телефоні…', 'Bevestig op uw telefoon…') : tr(lang, 'Схвалити й встановити', 'Goedkeuren en installeren')}</button>
        {afwijs?.id !== v.id && <button type='button' className='ut-knop ut-knop-gevaar' disabled={!!busy} onClick={() => setAfwijs({ id: v.id, reden: '' })}><X aria-hidden='true' />{tr(lang, 'Відхилити', 'Afwijzen')}</button>}
      </div>
      {afwijs?.id === v.id && <AfwijsVenster lang={lang} v={v} reden={afwijs.reden} setReden={(r) => setAfwijs({ id: v.id, reden: r })} busy={!!busy}
        onAfwijzen={(r) => { afwijzen(v, r); setAfwijs(null); }} onTerug={() => setAfwijs(null)} />}
      {!klaar && <p className='ut-hint'>{!data.schakelaar ? foutTekst(lang, 'PASSKEY_GOEDKEURING_UIT') : !data.passkeys.length ? foutTekst(lang, 'GEEN_PASSKEY') : tr(lang, 'Відкрийте цю сторінку в браузері з підтримкою passkey.', 'Open deze pagina in een browser die passkeys ondersteunt.')}</p>}
    </article>; })}
  </section>;
}
