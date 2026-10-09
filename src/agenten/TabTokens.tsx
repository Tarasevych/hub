// «Токени й двері»: agenttokens voor de MCP-deur (/Grok) als rijen, uitgeven met naam (sleutel één keer zichtbaar) en de
// schakelaars van de deur (alleen lezen: ze staan in een root-bestand op de server).
import { useState } from 'react';
import { Check, Copy, DoorOpen, KeyRound, Trash2 } from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody } from '../agents-data';
import { Help, Logo, Section, type Tr } from '../mcp-ui';
import { aiLogo, isoMs, type DeurToken } from './data';
import { SWITCHES } from './deur';
import { Badge, datum, exact, gebruiktBinnen, GevaarKnop, Groep, Knop, Melding, Rij, Tech, useActies } from './ui';

type Data = { tokens: DeurToken[]; rechten: Record<string, boolean>; catalogus: Array<{ id: string; uk: string; nl: string; group?: string }>; bestand: string };

export default function TabTokens({ tr, data, naActie, item, kies }: { tr: Tr; data: Data | null; naActie: () => Promise<void>; item: string; kies: (id: string) => void }) {
  const acties = useActies(tr);
  const [naam, setNaam] = useState('grok');
  const [vers, setVers] = useState<{ naam: string; token: string } | null>(null);
  const [gekopieerd, setGekopieerd] = useState(false);
  const mag = !data || data.rechten.tokens !== false;
  const nu = Date.now();
  const actief = (data?.tokens ?? []).filter((t) => !t.revokedAt && (isoMs(t.expiresAt) ?? 0) > nu);
  const weg = (data?.tokens ?? []).filter((t) => !actief.includes(t));

  const uitgeven = () => acties.voerUit('nieuw', async () => {
    const r = await api.post('/api/mcp/tokens', { ...sessionBody(), name: naam });
    const tok = String(r.data?.token?.token || '');
    setVers({ naam, token: tok });
    try { sessionStorage.setItem('mcp-fresh-token', tok); } catch { /* privémodus */ }
    await naActie();
    return tr(`Токен «${naam}» випущено: діє 30 днів. Скопіюйте його зараз — потім буде видно лише префікс.`, `Token «${naam}» uitgegeven: 30 dagen geldig. Kopieer hem nu — daarna is alleen het voorvoegsel zichtbaar.`);
  }, ['Не вдалося випустити токен', 'Token uitgeven mislukt']);
  const intrekken = (t: DeurToken) => acties.voerUit(`tok:${t.id}`, async () => {
    await api.post('/api/mcp/tokens/revoke', { ...sessionBody(), id: t.id });
    if (vers && t.prefix && vers.token.startsWith(t.prefix)) setVers(null);
    await naActie();
    return tr(`Токен «${t.name}» відкликано о ${exact(Date.now())}. Агент із ним більше не пройде двері; рядок перенесено до «Відкликані».`, `Token «${t.name}» ingetrokken om ${exact(Date.now())}. Een agent ermee komt niet meer door de deur; de rij staat nu bij "Ingetrokken".`);
  }, ['Не вдалося відкликати токен', 'Token intrekken mislukt']);

  const rij = (t: DeurToken, historisch = false) => {
    const sleutel = `tok:${t.id}`;
    const logo = aiLogo(t.name);
    return (
      <Rij key={t.id} id={sleutel} open={item === sleutel} onToggle={() => kies(item === sleutel ? '' : sleutel)} gedimd={historisch} data={{ token: t.id, status: historisch ? 'ingetrokken' : 'actief' }}
        logo={<Logo kind={logo === 'aiclient' ? 'key' : logo} size={30} label={t.name} />} titel={t.name}
        badges={historisch ? <Badge toon='bad' data='historie'>{t.revokedAt ? tr('Відкликано', 'Ingetrokken') : tr('Закінчився', 'Verlopen')}</Badge> : null}
        status={historisch
          ? <>{t.revokedAt ? tr(`Відкликано ${datum(isoMs(t.revokedAt))}`, `Ingetrokken op ${datum(isoMs(t.revokedAt))}`) : tr(`Закінчився ${datum(isoMs(t.expiresAt))}`, `Verlopen op ${datum(isoMs(t.expiresAt))}`)} · <code>{t.prefix}…</code></>
          : <>{gebruiktBinnen(isoMs(t.lastSeenAt), tr)} · <code>{t.prefix}…</code> · {tr(`викликів: ${t.calls}`, `aanroepen: ${t.calls}`)} · {tr(`діє до ${datum(isoMs(t.expiresAt))}`, `geldig tot ${datum(isoMs(t.expiresAt))}`)}</>}
        acties={historisch ? undefined : <GevaarKnop tr={tr} sleutel={sleutel} label={tr('Відкликати', 'Intrekken')} ja={tr('Так, відкликати', 'Ja, intrekken')} acties={acties} icoon={<Trash2 />} klein vraag={tr(`Агент із токеном «${t.name}» одразу втратить доступ.`, `Een agent met token «${t.name}» verliest meteen de toegang.`)} onJa={() => void intrekken(t)} />}>
        <Tech rijen={[
          [tr('ID токена', 'Token-id'), <code>{t.id}</code>], [tr('Префікс', 'Voorvoegsel'), <code>{t.prefix}…</code>],
          [tr('Дозволи', 'Rechten'), <code>{Array.isArray(t.scopes) ? t.scopes.join(' ') : String(t.scopes ?? '—')}</code>],
          [tr('Викликів', 'Aanroepen'), String(t.calls)], [tr('Створено', 'Gemaakt'), exact(isoMs(t.createdAt))], [tr('Остання активність', 'Laatste activiteit'), exact(isoMs(t.lastSeenAt))],
          [tr('Діє до', 'Geldig tot'), exact(isoMs(t.expiresAt))], t.revokedAt ? [tr('Відкликано', 'Ingetrokken'), exact(isoMs(t.revokedAt))] : null,
          [tr('Як користуватися', 'Gebruik'), <code>Authorization: Bearer {t.prefix}…</code>],
        ]} />
      </Rij>
    );
  };

  return (
    <div className='ag-tab' data-tab-inhoud='tokens'>
      <form className='ag-formrij' onSubmit={(e) => { e.preventDefault(); if (naam.trim()) void uitgeven(); }}>
        <label className='ag-veld ag-veld-breed'><span>{tr('Новий токен для агента', 'Nieuw token voor een agent')}</span>
          <input value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={80} placeholder={tr('Ім’я агента, напр. grok', 'Naam van de agent, bijv. grok')} disabled={!mag} />
        </label>
        <Knop type='submit' toon='primary' icoon={<KeyRound />} bezig={acties.bezig === 'nieuw'} disabled={!mag || !naam.trim()} data='token-nieuw'>{tr('Випустити токен', 'Token uitgeven')}</Knop>
        <small className='hub-meta ag-formrij-uitleg'>{mag ? tr('Діє 30 днів, дає доступ лише до ваших дверей (/Grok). Спершу сайт попросить підтвердити доступ.', '30 dagen geldig, alleen toegang tot uw deur (/Grok). Eerst vraagt de site om de toegang te bevestigen.') : tr('Випуск токенів вимкнено у файлі дозволів сервера.', 'Tokens uitgeven staat uit in het rechtenbestand van de server.')}</small>
      </form>
      {vers ? (
        <div className='ag-kaart ag-vers' data-vers-token='1'>
          <b>{tr(`Токен «${vers.naam}» — видно лише зараз`, `Token «${vers.naam}» — alleen nu zichtbaar`)}</b>
          <code className='hub-code'>{vers.token}</code>
          <div className='ag-knoppen'><Knop icoon={gekopieerd ? <Check /> : <Copy />} onClick={() => { void navigator.clipboard?.writeText(vers.token).then(() => { setGekopieerd(true); window.setTimeout(() => setGekopieerd(false), 2000); }).catch(() => undefined); }}>{gekopieerd ? tr('Скопійовано', 'Gekopieerd') : tr('Скопіювати', 'Kopiëren')}</Knop><Knop onClick={() => setVers(null)}>{tr('Я зберіг токен', 'Ik heb het token bewaard')}</Knop></div>
        </div>
      ) : null}
      <Melding uitkomst={acties.uitkomst} tr={tr} onSluit={() => acties.setUitkomst(null)} />
      <div className='ag-lijstkop'><p className='ag-lijstkop-tekst'>{actief.length ? tr(`Активних токенів: ${actief.length}`, `Actieve tokens: ${actief.length}`) : tr('Активних токенів немає.', 'Geen actieve tokens.')}</p></div>
      {data === null ? <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p> : actief.length ? <ul className='ag-lijst' data-lijst='tokens'>{actief.map((t) => rij(t))}</ul> : null}
      <Groep titel={tr('Відкликані й завершені', 'Ingetrokken en verlopen')} aantal={weg.length} data='tokens-historie'>{weg.map((t) => rij(t, true))}</Groep>

      <Section id='ag-deuren' icon={<DoorOpen />} title={tr('Двері: що дозволено агентам', 'Deur: wat agenten mogen')} subtitle={tr('Лише показ. Змінює тільки власник сервера у файлі (root).', 'Alleen weergave. Alleen de eigenaar van de server wijzigt dit in het bestand (root).')} defaultOpen={false}>
        {data ? (
          <table className='ai-tabel ag-deuren'>
            <thead><tr><th scope='col'>{tr('Перемикач', 'Schakelaar')}</th><th scope='col'>{tr('Стан', 'Stand')}</th></tr></thead>
            <tbody>{[...SWITCHES.map((s) => s.id), ...data.catalogus.map((p) => p.id).filter((id) => !SWITCHES.some((s) => s.id === id))].map((id) => { const l = SWITCHES.find((s) => s.id === id); const r = data.catalogus.find((p) => p.id === id); const p = { id, uk: r?.uk || l?.uk || id, nl: r?.nl || l?.nl || id, uitleg: l ? { title: tr(l.uk, l.nl), on: tr(l.onUk, l.onNl), off: tr(l.offUk, l.offNl) } : null }; return <tr key={p.id} data-deur={p.id}><td>{tr(p.uk, p.nl)} {p.uitleg ? <Help tr={tr} content={p.uitleg} /> : null} <code className='hub-meta'>{p.id}</code></td><td><Badge toon={data.rechten[p.id] ? 'ok' : 'off'}>{data.rechten[p.id] ? tr('увімкнено', 'aan') : tr('вимкнено', 'uit')}</Badge></td></tr>; })}</tbody>
          </table>
        ) : null}
        {data?.bestand ? <p className='hub-meta'>{tr('Файл', 'Bestand')}: <code>{data.bestand}</code></p> : null}
      </Section>
    </div>
  );
}
