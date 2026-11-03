// «Токени»: AI koppelen aan de PRIVÉRUIMTE (automatisch in één klik of handmatig met een token, zie AiVerbinden.tsx) en de eigen
// agenttokens als rijen. Alles van de serverdeur (verbindingen, schakelaars, technische tokens) is sitebeheer en staat op
// mcp.*/verbindingen en mcp.*/dashboard (technisch profiel), niet hier in de accountruimte.
import { useId } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody } from '../agenten-gegevens';
import { Logo, type Tr } from '../mcp-ui';
import { aiLogo, inRuimte, isoMs, type DeurToken } from './gegevens';
import { Badge, datum, exact, gebruiktBinnen, GevaarKnop, Groep, Melding, Rij, Tech, useActies } from './ui';
import AiVerbinden from './AiVerbinden';
import type { KlantId } from '../../shared/ai-verbinding';
import './agenten-tabs-2.css';

type Data = { tokens: DeurToken[]; rechten: Record<string, boolean>; catalogus: Array<{ id: string; uk: string; nl: string; group?: string }>; bestand: string };

/** `vastKlant`: op de pagina van één agent staat de AI al vast — dan koppelt deze tab alleen die ene AI (geen tweede keuzerij). */
export default function TabTokens({ tr, data, naActie, item, kies, vastKlant }: { tr: Tr; data: Data | null; naActie: () => Promise<void>; item: string; kies: (id: string) => void; vastKlant?: KlantId }) {
  const acties = useActies(tr);
  // Eigen id: TabTokens staat op de hub én (met vastKlant) op de pagina van één agent.
  const kopId = useId();
  const mag = !data || data.rechten.tokens !== false;
  const nu = Date.now();
  // Alleen tokens van de privéruimte: technische tokens (server) staan op mcp.*/verbindingen.
  const eigen = inRuimte(data?.tokens, 'prive');
  const actief = eigen.filter((t) => !t.revokedAt && (isoMs(t.expiresAt) ?? 0) > nu);
  const weg = eigen.filter((t) => !actief.includes(t));

  const intrekken = (t: DeurToken) => acties.voerUit(`tok:${t.id}`, async () => {
    await api.post('/api/mcp/tokens/revoke', { ...sessionBody(), id: t.id });
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

  // INTEG-001 (agpag2, 03.11.2026): twee blokken (.ag-blok) — «Підключити ШІ» (AiVerbinden, zelf een blok) en «Ваші токени» met de
  // teller, de lijst of een lege staat, en ingeklapt de geschiedenis.
  return (
    <div className='ag-tab ag2-blokken' data-tab-inhoud='tokens'>
      <AiVerbinden tr={tr} magTokens={mag} naActie={naActie} ruimte='prive' vastKlant={vastKlant} />
      <section className='ag-blok' data-ag-blok='tokens' aria-labelledby={kopId}>
        <header className='ag-blok-kop'>
          <h3 className='ag-blok-titel' id={kopId}><KeyRound aria-hidden='true' /> {tr('Ваші токени', 'Uw tokens')}</h3>
          <p className='ag-blok-uitleg'>{tr('Ключі, з якими ШІ або агент входить без вікна входу; відкликаний ключ перестає діяти одразу.', 'Sleutels waarmee een AI of agent zonder aanmeldvenster binnenkomt; een ingetrokken sleutel werkt meteen niet meer.')}</p>
        </header>
        <Melding uitkomst={acties.uitkomst} tr={tr} onSluit={() => acties.setUitkomst(null)} />
        {data === null ? <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p> : actief.length ? (
          <>
            <p className='ag2-samenvatting' data-tokens-telling={actief.length}>{tr(`Активних токенів: ${actief.length}`, `Actieve tokens: ${actief.length}`)}</p>
            <ul className='ag-lijst' data-lijst='tokens'>{actief.map((t) => rij(t))}</ul>
          </>
        ) : <p className='ag-leeg' data-tokens-leeg='1'>{tr('Активних токенів немає. Новий токен випускається в блоці «Підключити ШІ» вище — спосіб «вручну».', 'Geen actieve tokens. Een nieuw token geeft u uit in het blok «AI koppelen» hierboven — manier «handmatig».')}</p>}
        <Groep titel={tr('Відкликані й завершені', 'Ingetrokken en verlopen')} aantal={weg.length} data='tokens-historie'>{weg.map((t) => rij(t, true))}</Groep>
      </section>
    </div>
  );
}
