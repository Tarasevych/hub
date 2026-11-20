// «Зовнішні MCP» op mcp.*/agents: de vreemde MCP-servers waar DEZE site zelf naartoe gaat (de site als
// MCP-KLANT, backend/mcp-klant/*). Het tabblad hoort hier omdat deze pagina de ÉNE plek is voor alles over
// AI-toegang; er komt geen nieuwe pagina bij.
//
// Wat hier staat, staat er omdat het werkt:
//   • toevoegen op adres (alleen https) met een naam, een RUIMTE (privé of technisch) en eventueel een token;
//   • «Перевірити зʼєднання» doet een ECHTE `initialize` + `tools/list`; de stand (vervoer, protocolversie,
//     naam van de server, aantal hulpmiddelen) komt uit dat antwoord en nergens anders vandaan;
//   • de hulpmiddelen staan er met hun beschrijving, en elk hulpmiddel kan apart aan of uit;
//   • loskoppelen haalt de verbinding, het geheugen van de hulpmiddelen en de sleutel uit de kluis weg.
// OAuth 2.1 met dynamische clientregistratie is er NIET: dat staat er met de lijst van wat ervoor nodig is, en
// er is geen knop. Zonder witte lijst van de eigenaar staat er wat hij in welk bestand moet zetten.
//
// INTEG-001 (03.11.2026): volgorde naar wat de eigenaar komt doen — eerst wat het werk blokkeert (lege witte lijst), dan de
// verbonden servers, dan «Додати сервер», de witte lijst, en onderaan ingeklapt «Як це працює» (protocol, grenzen, OAuth).
// De kop «Зовнішні MCP-сервери» staat al in de rand van de pagina en wordt hier niet herhaald.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Globe, Info, Link2, Plug, RefreshCw, Server, Trash2 } from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody } from '../agenten-gegevens';
import { Logo, type Tr } from '../mcp-ui';
import { Badge, exact, GevaarKnop, Knop, Melding, Rij, Tech, useActies } from './ui';
import { foutTekst } from './fouten';
import ExterneHosts from '../besluit/ExterneHosts'; // witte lijst beheren met een passkey-besluit (zone B 22.10.2026, RUNBOOK §15)
import GeheimInvoer from '../geheim/GeheimInvoer';
import McpInspectorStudio from './McpInspectorStudio';
import './agenten-inspectie-maquette.css';

type Hulpmiddel = {
  naam: string; titel: string; beschrijving: string; alleenLezen: boolean; destructief: boolean; aan: boolean;
  gezienOp: number; aiNaam: string;
};
type Verbinding = {
  id: string; naam: string; adres: string; host: string; ruimte: 'prive' | 'technisch';
  authWijze: 'geen' | 'bearer' | 'oauth'; sleutelIngesteld: boolean;
  vervoer: string; protocolVersie: string; serverNaam: string; serverVersie: string;
  mogelijkheden: Record<string, unknown>; instructies: string; actief: boolean;
  staat: 'nieuw' | 'bezig' | 'klaar' | 'fout'; fout: string;
  laatstOkOp: number; laatstFoutOp: number; toolsBijgewerktOp: number; aantalTools: number;
  hulpmiddelen: Hulpmiddel[];
};
type Overzicht = {
  verbindingen: Verbinding[];
  witteLijst: { hosts: string[]; bron: string; leeg: boolean };
  protocol: { versies: string[]; voorkeur: string };
  grenzen: Record<string, number>;
  oauth: { geimplementeerd: boolean; code: string; ontbreekt: string[] };
  mogelijkheden: { vervoer: Record<string, unknown>; methoden: string[]; meldingen: string[] };
};

/** De foutcodes van de klant in gewone taal. Onbekende codes worden letterlijk getoond (nooit stil weggelaten). */
const FOUT_TEKST: Record<string, [string, string]> = {
  EXTERN_MCP_HOST_NIET_TOEGESTAAN: ['Цього хоста немає в білому списку власника.', 'Deze host staat niet op de witte lijst van de eigenaar.'],
  EXTERN_MCP_SCHEMA_NIET_TOEGESTAAN: ['Лише https.', 'Alleen https.'],
  EXTERN_MCP_ADRES_MET_WACHTWOORD: ['В адресі не може бути логіна чи пароля.', 'In het adres mag geen gebruikersnaam of wachtwoord staan.'],
  EXTERN_MCP_ADRES_GEWEIGERD: ['Адреса веде у приватну мережу — відмовлено (захист від SSRF).', 'Het adres wijst naar een privénetwerk — geweigerd (SSRF-bescherming).'],
  EXTERN_MCP_OMLEIDING_NIET_GEVOLGD: ['Сервер переспрямовує; переспрямування ми не виконуємо.', 'De server stuurt door; omleidingen volgen wij niet.'],
  EXTERN_MCP_ANTWOORD_TE_GROOT: ['Відповідь завелика.', 'Het antwoord is te groot.'],
  EXTERN_MCP_TIJD_OVERSCHREDEN: ['Сервер не відповів у відведений час.', 'De server antwoordde niet binnen de tijd.'],
  EXTERN_MCP_TE_VEEL_AANROEPEN: ['Забагато викликів за хвилину.', 'Te veel aanroepen in een minuut.'],
  EXTERN_MCP_GEEN_TOEGANG: ['Сервер відмовив у доступі (перевірте токен).', 'De server weigerde toegang (controleer het token).'],
  EXTERN_MCP_PROTOCOL_NIET_ONDERSTEUND: ['Сервер говорить версією протоколу, якої ми не знаємо.', 'De server spreekt een protocolversie die wij niet kennen.'],
  EXTERN_MCP_GEEN_VERVOER: ['Ні сучасний (Streamable HTTP), ні старий (HTTP+SSE) транспорт не відповів.', 'Noch het moderne (Streamable HTTP) noch het oude (HTTP+SSE) vervoer antwoordde.'],
  EXTERN_MCP_OAUTH_NIET_GEIMPLEMENTEERD: ['OAuth ще не реалізовано (див. перелік нижче).', 'OAuth is nog niet geïmplementeerd (zie de lijst hieronder).'],
  EXTERN_MCP_SERVER_FOUT: ['Сервер повернув помилку.', 'De server gaf een fout terug.'],
  EXTERN_MCP_TE_VEEL_VERBINDINGEN: ['Досягнуто межі кількості підключень.', 'De grens voor het aantal verbindingen is bereikt.'],
};
const fout = (code: string, tr: Tr) => (FOUT_TEKST[code] ? tr(FOUT_TEKST[code][0], FOUT_TEKST[code][1]) : code);

const VERVOER_NAAM: Record<string, [string, string]> = {
  streamable: ['Streamable HTTP (сучасний)', 'Streamable HTTP (modern)'],
  sse: ['HTTP+SSE (старий, 2024-11-05)', 'HTTP+SSE (oud, 2024-11-05)'],
  onbekend: ['ще не визначено', 'nog niet vastgesteld'],
};

export default function TabExternMcp({ tr }: { tr: Tr }) {
  const acties = useActies(tr);
  const [data, setData] = useState<Overzicht | null>(null);
  const [laadFout, setLaadFout] = useState<unknown>(null);
  const [open, setOpen] = useState('');
  const [adres, setAdres] = useState('');
  const [naam, setNaam] = useState('');
  const [ruimte, setRuimte] = useState<'prive' | 'technisch'>('prive');
  const [token, setToken] = useState('');
  const besluitCtx = useMemo(() => sessionBody(), []);

  const laad = useCallback(async () => {
    try { setData((await api.post('/api/owner/externe-mcp/overzicht', sessionBody())).data as Overzicht); setLaadFout(null); }
    catch (e) { setLaadFout(e); }
  }, []);
  useEffect(() => { void laad(); }, [laad]);

  const toevoegen = () => acties.voerUit('toevoegen', async () => {
    const res = await api.post('/api/owner/externe-mcp/toevoegen', {
      ...sessionBody(), adres: adres.trim(), naam: naam.trim(), ruimte, authWijze: token.trim() ? 'bearer' : 'geen', ...(token.trim() ? { token: token.trim() } : {}),
    });
    if (res.data?.ok === false) throw new Error(String(res.data?.fout || 'EXTERN_MCP_MISLUKT'));
    setAdres(''); setNaam(''); setToken('');
    await laad();
    return tr('Додано. Тепер натисніть «Перевірити зʼєднання»: лише після справжнього initialize зʼявиться перелік інструментів.',
      'Toegevoegd. Klik nu op "Verbinding testen": de lijst met hulpmiddelen komt er pas na een echte initialize.');
  }, ['Не вдалося додати підключення', 'Verbinding toevoegen mislukt']);

  const testen = (v: Verbinding) => acties.voerUit(`test:${v.id}`, async () => {
    const res = await api.post('/api/owner/externe-mcp/testen', { ...sessionBody(), id: v.id });
    await laad();
    if (res.data?.ok !== true) throw new Error(String(res.data?.fout || 'EXTERN_MCP_MISLUKT'));
    const n = Number(res.data?.verbinding?.aantalTools || 0);
    return tr(`Зʼєднання працює: транспорт ${res.data?.vervoer}, протокол ${res.data?.protocol}, інструментів: ${n}.`,
      `De verbinding werkt: vervoer ${res.data?.vervoer}, protocol ${res.data?.protocol}, hulpmiddelen: ${n}.`);
  }, ['Перевірка не вдалася', 'De controle mislukte']);

  const schakelen = (v: Verbinding) => acties.voerUit(`aan:${v.id}`, async () => {
    await api.post('/api/owner/externe-mcp/schakelen', { ...sessionBody(), id: v.id, actief: !v.actief });
    await laad();
    return v.actief
      ? tr('Вимкнено. ШІ більше не бачить інструментів цього сервера.', 'Uitgezet. De AI ziet de hulpmiddelen van deze server niet meer.')
      : tr('Увімкнено.', 'Aangezet.');
  }, ['Не вдалося перемкнути', 'Omschakelen mislukt']);

  const hulpmiddel = (v: Verbinding, h: Hulpmiddel) => acties.voerUit(`h:${v.id}:${h.naam}`, async () => {
    await api.post('/api/owner/externe-mcp/hulpmiddel', { ...sessionBody(), id: v.id, naam: h.naam, aan: !h.aan });
    await laad();
    return h.aan ? tr(`Інструмент «${h.naam}» вимкнено.`, `Hulpmiddel «${h.naam}» uitgezet.`) : tr(`Інструмент «${h.naam}» увімкнено.`, `Hulpmiddel «${h.naam}» aangezet.`);
  }, ['Не вдалося перемкнути інструмент', 'Hulpmiddel omschakelen mislukt']);

  const verwijderen = (v: Verbinding) => acties.voerUit(`weg:${v.id}`, async () => {
    await api.post('/api/owner/externe-mcp/verwijderen', { ...sessionBody(), id: v.id });
    await laad();
    return tr('Відключено: підключення, кеш інструментів і ключ зі сховища видалено.',
      'Losgekoppeld: de verbinding, het geheugen van de hulpmiddelen en de sleutel in de kluis zijn verwijderd.');
  }, ['Не вдалося відключити', 'Loskoppelen mislukt']);

  const leeg = data?.witteLijst.leeg !== false;

  return (
    <div className='ag-tab' data-tab-inhoud='extern'>
      <Melding uitkomst={acties.uitkomst} tr={tr} onSluit={() => acties.setUitkomst(null)} />
      {laadFout ? <p className='ag-melding ag-melding-fout' role='alert'>{foutTekst(laadFout, tr, ['Не вдалося завантажити підключення', 'Verbindingen laden mislukt'])}</p> : null}

      {data && leeg ? (
        <section className='ag-blok is-waarschuwing' role='status' data-extern-witte-lijst='leeg'>
          <header className='ag-blok-kop'>
            <h3 className='ag-blok-titel'><AlertTriangle aria-hidden='true' /> {tr('Спочатку дозвольте хости (білий список власника)', 'Sta eerst hosts toe (witte lijst van de eigenaar)')}</h3>
            <p className='ag-blok-uitleg'>{tr('Жодне вихідне підключення неможливе, поки список дозволених хостів порожній. Сайт сам його не змінює: власник додає хости нижче й підписує список passkey — root перевіряє підпис і записує файл.',
              'Geen enkele uitgaande verbinding is mogelijk zolang de lijst met toegestane hosts leeg is. De site wijzigt hem niet zelf: de eigenaar voegt hieronder hosts toe en ondertekent de lijst met zijn passkey — root controleert de handtekening en schrijft het bestand.')}</p>
          </header>
          <p className='ag-meta'>{tr('Де: ', 'Waar: ')}<code>{data.witteLijst.bron}</code></p>
        </section>
      ) : null}

      <section className='ag-blok' data-extern-lijst='1'>
        <header className='ag-blok-kop'>
          <h3 className='ag-blok-titel'><Server aria-hidden='true' /> {tr('Підключені сервери', 'Verbonden servers')}{data?.verbindingen.length ? <span className='ag-teller'>{data.verbindingen.length}</span> : null}</h3>
          <p className='ag-blok-uitleg'>{tr('Кожен сервер можна перевірити, вимкнути або відключити; його інструменти вмикаються поодинці в рядку сервера.', 'Elke server kunt u testen, uitzetten of loskoppelen; zijn hulpmiddelen zet u apart aan in de rij van de server.')}</p>
        </header>
      {data === null ? <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p> : !data.verbindingen.length ? (
        <p className='ag-leeg' data-extern-leeg='1'>{tr('Поки жодного зовнішнього MCP-сервера. Додайте перший у блоці «Додати сервер» нижче.', 'Nog geen enkele externe MCP-server. Voeg de eerste toe in het blok «Server toevoegen» hieronder.')}</p>
      ) : (
        <ul className='ag-lijst' data-lijst='extern-mcp'>
          {data.verbindingen.map((v) => {
            const sleutel = `ext:${v.id}`;
            const goed = v.staat === 'klaar' && v.actief;
            return (
              <Rij key={v.id} id={sleutel} open={open === sleutel} onToggle={() => setOpen(open === sleutel ? '' : sleutel)} gedimd={!v.actief}
                data={{ extern: v.id, staat: v.staat, ruimte: v.ruimte }}
                logo={<Logo kind='internal' size={30} label={v.host} />}
                titel={v.naam || v.serverNaam || v.host}
                badges={<>
                  <Badge toon={goed ? 'ok' : v.staat === 'fout' ? 'bad' : 'warn'} data='staat'>
                    {v.staat === 'klaar' ? tr('працює', 'werkt') : v.staat === 'fout' ? tr('помилка', 'fout') : v.staat === 'bezig' ? tr('перевіряю', 'bezig') : tr('ще не перевірено', 'nog niet getest')}
                  </Badge>
                  <Badge toon={v.ruimte === 'technisch' ? 'info' : 'off'} data='ruimte'>{v.ruimte === 'technisch' ? tr('технічний', 'technisch') : tr('приватний', 'privé')}</Badge>
                  {v.actief ? null : <Badge toon='off' data='uit'>{tr('вимкнено', 'uit')}</Badge>}
                </>}
                status={<>
                  <code>{v.host}</code>
                  {v.staat === 'klaar' ? <> · {tr(VERVOER_NAAM[v.vervoer]?.[0] ?? v.vervoer, VERVOER_NAAM[v.vervoer]?.[1] ?? v.vervoer)} · {tr('протокол', 'protocol')} <code>{v.protocolVersie}</code> · {tr(`інструментів: ${v.aantalTools}`, `hulpmiddelen: ${v.aantalTools}`)}</> : null}
                  {v.staat === 'fout' && v.fout ? <> · <b>{fout(v.fout, tr)}</b></> : null}
                </>}
                acties={<>
                  <Knop icoon={<RefreshCw />} bezig={acties.bezig === `test:${v.id}`} onClick={() => void testen(v)} data={`test:${v.id}`}>
                    {tr('Перевірити зʼєднання', 'Verbinding testen')}
                  </Knop>
                  <Knop icoon={<Plug />} bezig={acties.bezig === `aan:${v.id}`} onClick={() => void schakelen(v)} data={`aan:${v.id}`}>
                    {v.actief ? tr('Вимкнути', 'Uitzetten') : tr('Увімкнути', 'Aanzetten')}
                  </Knop>
                  <GevaarKnop tr={tr} sleutel={`weg:${v.id}`} label={tr('Відключити', 'Loskoppelen')} ja={tr('Так, відключити', 'Ja, loskoppelen')} acties={acties} icoon={<Trash2 />} klein
                    vraag={tr('Підключення, перелік інструментів і збережений ключ буде видалено.', 'De verbinding, de lijst met hulpmiddelen en de bewaarde sleutel worden verwijderd.')}
                    onJa={() => void verwijderen(v)} />
                </>}>
                <Tech rijen={[
                  [tr('Адреса', 'Adres'), <code>{v.adres}</code>],
                  [tr('Сервер про себе', 'De server over zichzelf'), <span>{v.serverNaam || '—'} {v.serverVersie ? <code>{v.serverVersie}</code> : null}</span>],
                  [tr('Транспорт', 'Vervoer'), <span>{tr(VERVOER_NAAM[v.vervoer]?.[0] ?? v.vervoer, VERVOER_NAAM[v.vervoer]?.[1] ?? v.vervoer)}</span>],
                  [tr('Версія протоколу', 'Protocolversie'), <code>{v.protocolVersie || '—'}</code>],
                  [tr('Можливості сервера', 'Mogelijkheden van de server'), <code>{Object.keys(v.mogelijkheden || {}).join(', ') || '—'}</code>],
                  [tr('Автентифікація', 'Aanmelden'), <span>{v.authWijze === 'bearer' ? tr(`токен зі сховища${v.sleutelIngesteld ? '' : ' (ключ відсутній!)'}`, `token uit de kluis${v.sleutelIngesteld ? '' : ' (sleutel ontbreekt!)'}`) : v.authWijze === 'oauth' ? 'OAuth' : tr('без токена', 'zonder token')}</span>],
                  [tr('Останній успіх', 'Laatste succes'), exact(v.laatstOkOp)],
                  v.laatstFoutOp ? [tr('Остання помилка', 'Laatste fout'), <span>{exact(v.laatstFoutOp)} {v.fout ? <code>{v.fout}</code> : null}</span>] : null,
                  [tr('Перелік оновлено', 'Lijst bijgewerkt'), exact(v.toolsBijgewerktOp)],
                  v.instructies ? [tr('Текст сервера (недовірений)', 'Tekst van de server (onbetrouwbaar)'), <q>{v.instructies.slice(0, 400)}</q>] : null,
                ]} />
                <h4>{tr('Інструменти цього сервера', 'Hulpmiddelen van deze server')}</h4>
                {v.hulpmiddelen.length ? (
                  <ul className='ag-sublijst' data-lijst='extern-hulpmiddelen'>
                    {v.hulpmiddelen.map((h) => (
                      <li key={h.naam} className='ag-subrij' data-hulpmiddel={h.naam} data-aan={String(h.aan)}>
                        <div>
                          <b><code>{h.naam}</code></b>{h.titel ? ` — ${h.titel}` : ''}
                          {h.alleenLezen ? <Badge toon='ok' data='lezen'>{tr('лише читання (за словами сервера)', 'alleen lezen (volgens de server)')}</Badge> : <Badge toon='warn' data='schrijft'>{tr('змінює — питаємо вас щоразу', 'wijzigt — wij vragen u elke keer')}</Badge>}
                          <p className='ag-meta'>{h.beschrijving ? h.beschrijving.slice(0, 300) : tr('сервер не дав опису', 'de server gaf geen beschrijving')}</p>
                          <small className='ag-meta'>{tr('для ШІ', 'voor de AI')}: <code>{h.aiNaam}</code></small>
                        </div>
                        <Knop bezig={acties.bezig === `h:${v.id}:${h.naam}`} onClick={() => void hulpmiddel(v, h)} data={`h:${h.naam}`}>
                          {h.aan ? tr('Вимкнути', 'Uitzetten') : tr('Увімкнути', 'Aanzetten')}
                        </Knop>
                      </li>
                    ))}
                  </ul>
                ) : <p className='ag-leeg'>{tr('Переліку ще немає — натисніть «Перевірити зʼєднання».', 'Er is nog geen lijst — klik op "Verbinding testen".')}</p>}
              </Rij>
            );
          })}
        </ul>
      )}
      </section>

      <section className='ag-blok' data-extern-toevoegen='1'>
        <header className='ag-blok-kop'>
          <h3 className='ag-blok-titel'><Link2 aria-hidden='true' /> {tr('Додати сервер', 'Server toevoegen')}</h3>
          <p className='ag-blok-uitleg'>{tr('Лише https-адреса з білого списку власника; після додавання натисніть у рядку сервера «Перевірити зʼєднання».', 'Alleen een https-adres van de witte lijst van de eigenaar; klik na het toevoegen in de rij van de server op «Verbinding testen».')}</p>
        </header>
        <div className='ag-formraster'>
          <label className='ag-veld ag-veld-vol'><span>{tr('Адреса MCP-сервера (https)', 'Adres van de MCP-server (https)')}</span>
            <input type='url' inputMode='url' autoComplete='off' value={adres} placeholder='https://api.githubcopilot.com/mcp/x/all'
              onChange={(e) => setAdres(e.target.value)} data-extern-veld='adres' />
          </label>
          <label className='ag-veld'><span>{tr('Назва (для себе)', 'Naam (voor uzelf)')}</span>
            <input type='text' value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={200} data-extern-veld='naam' />
          </label>
          <label className='ag-veld'><span>{tr('Простір', 'Ruimte')}</span>
            <select value={ruimte} onChange={(e) => setRuimte(e.target.value === 'technisch' ? 'technisch' : 'prive')} data-extern-veld='ruimte'>
              <option value='prive'>{tr('Приватний (ваші дані)', 'Privé (uw gegevens)')}</option>
              <option value='technisch'>{tr('Технічний (сайт і сервер)', 'Technisch (site en server)')}</option>
            </select>
          </label>
          <label className='ag-veld ag-veld-vol'><span>{tr('Токен (необовʼязково; піде у ваше сховище, не в адресу)', 'Token (optioneel; gaat naar uw kluis, niet in het adres)')}</span>
            <GeheimInvoer t={tr} value={token} onChange={setToken} max={4096} autoComplete='off' soort='token' data={{ 'extern-veld': 'token' }} />
          </label>
        </div>
        <p className='ag-meta'>{tr('Простір не змішується: технічне підключення ШІ ніколи не побачить приватний сервер, і навпаки.',
          'De ruimtes worden niet gemengd: een technische AI-verbinding ziet nooit een privéserver, en omgekeerd.')}</p>
        <div className='ag-knoppen'>
          <Knop toon='primary' icoon={<Link2 />} bezig={acties.bezig === 'toevoegen'} disabled={!adres.trim()} onClick={() => void toevoegen()} data='extern-toevoegen'>
            {tr('Додати', 'Toevoegen')}
          </Knop>
        </div>
      </section>

      {/* Witte lijst beheren zonder SSH: alleen de eigenaar ziet iets zinnigs (de route eist de eigenaarsrol; anderen krijgen de uitleg). */}
      <ExterneHosts tr={tr} ctx={besluitCtx} onKlaar={() => void laad()} />

      {data && !data.oauth.geimplementeerd ? (
        <section className='ag-blok' data-extern-oauth='niet-klaar'>
          <header className='ag-blok-kop'>
            <h3 className='ag-blok-titel'><Info aria-hidden='true' /> {tr('OAuth 2.1 з динамічною реєстрацією — ще не реалізовано', 'OAuth 2.1 met dynamische registratie — nog niet geïmplementeerd')}</h3>
            <p className='ag-blok-uitleg'>{tr('Сервери, які вимагають саме цього (наприклад MCP-сервер GitHub), поки підключити не вдасться. Кнопки для цього немає навмисно: вона б нічого не робила. Токен у заголовку Authorization працює повністю.',
              'Servers die juist dit vereisen (bijvoorbeeld de MCP-server van GitHub) zijn nog niet te koppelen. Er staat bewust geen knop: die zou niets doen. Een token in de Authorization-kop werkt volledig.')}</p>
          </header>
          <details className='ag-uitklap'>
            <summary>{tr('Що для цього ще бракує', 'Wat daarvoor nog ontbreekt')}</summary>
            <ol className='ag-stappen'>{data.oauth.ontbreekt.map((regel) => <li key={regel}>{regel}</li>)}</ol>
            <p className='ag-meta'><code>{data.oauth.code}</code></p>
          </details>
        </section>
      ) : null}

      <details className='ag-blok ag-blok-uitklap' data-extern-uitleg='1'>
        <summary className='ag-blok-kop'>
          <h3 className='ag-blok-titel'><Globe aria-hidden='true' /> {tr('Як це працює: протокол, межі, безпека', 'Hoe het werkt: protocol, grenzen, veiligheid')}</h3>
          <ChevronDown className='ag-chevron' aria-hidden='true' />
        </summary>
        <p>{tr('Тут сайт сам виступає клієнтом MCP: він підключається до чужого MCP-сервера і дає його інструменти вашому ШІ так само, як власні — з правами, підтвердженням для дій, що щось змінюють, і записом у журнал.',
          'Hier is de site zélf MCP-klant: hij verbindt met een vreemde MCP-server en geeft diens hulpmiddelen aan uw AI net als de eigen — met rechten, bevestiging voor wat iets wijzigt, en een regel in het logboek.')}</p>
        <p className='ag-meta'>{tr('Усе, що віддалений сервер повертає (назви, описи, результати), — це ДАНІ, а не інструкції: описи йдуть до ШІ з явною позначкою «недовірене».',
          'Alles wat de vreemde server teruggeeft (namen, beschrijvingen, resultaten) is DATA, geen instructie: beschrijvingen gaan naar de AI met een duidelijke markering "onbetrouwbaar".')}</p>
        {data ? (
          <Tech rijen={[
            [tr('Транспорти', 'Vervoer'), <span>{tr('сучасний Streamable HTTP + старий HTTP+SSE; stdio — ні (це локальний процес, не сервер)', 'modern Streamable HTTP + oud HTTP+SSE; stdio niet (dat is een lokaal proces, geen server)')}</span>],
            [tr('Версії протоколу', 'Protocolversies'), <code>{data.protocol.versies.join(', ')}</code>],
            [tr('Методи', 'Methoden'), <code>{data.mogelijkheden.methoden.join(', ')}</code>],
            [tr('Межі', 'Grenzen'), <span>{tr(`${data.grenzen.perMinuut} викликів/хв · ${Math.round(Number(data.grenzen.maxBytes) / 1024)} КБ на відповідь · ${Math.round(Number(data.grenzen.timeoutMs) / 1000)} с на запит · ${data.grenzen.maxVerbindingen} підключень`,
              `${data.grenzen.perMinuut} aanroepen/min · ${Math.round(Number(data.grenzen.maxBytes) / 1024)} kB per antwoord · ${Math.round(Number(data.grenzen.timeoutMs) / 1000)} s per verzoek · ${data.grenzen.maxVerbindingen} verbindingen`)}</span>],
            [tr('Білий список хостів', 'Witte lijst van hosts'), <code>{data.witteLijst.hosts.length ? data.witteLijst.hosts.join(', ') : tr('порожній', 'leeg')}</code>],
          ]} />
        ) : null}
      </details>

      <McpInspectorStudio tr={tr} />
    </div>
  );
}
