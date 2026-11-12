// Вбудований Інспектор, Студія та Реєстр MCP (2026-07-28 + 2025-11-25) для сторінки https://mcp.tarasevych.com/agenten.
// Поєднує:
//   • інтерактивний вебінспектор кінцевих точок (/claude, /gpt, /codex, /grok, /gemini, /copilot, /cursor, /antigravity, /autoclaw, /mcp)
//     із перемикачем епохи протоколу (auto, modern 2026-07-28, legacy 2025-11-25) та суворими перевірками (--strict);
//   • готові рецепти інспектора (Recipes) з однокліковим виконанням на сайті та копіюванням команд CLI / TUI / mcpdo;
//   • живу 7-крокову перевірку безпеки OAuth 2.1 (RFC 9728 PRM, RFC 8414 AS Metadata, PKCE S256, Origin 403, CIMD анти-SSRF,
//     RFC 9207 iss + RFC 8707 resource, Server Card + server.json);
//   • студію ресурсів mr://*, двомовних шаблонів запитів (prompts), навичок агента (ext-skills), розширень і наборів розробки (TypeScript, Python, Go, Rust).

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Check, ChevronDown, Code2, Copy, Play, RefreshCw, ShieldCheck, Sparkles, Terminal } from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody } from '../agenten-gegevens';
import type { Tr } from '../mcp-ui';
import { Badge, Knop, Segment, Tech } from './ui';

type EraModus = 'auto' | 'modern' | 'legacy';

type EigenEindpunt = {
  id: string;
  naam: string;
  url: string;
  prmUrl: string;
  verbonden: boolean;
  actieveTools: number;
  toegekendeTools: number;
  kanten: string[];
};

type ResourceItem = { uri: string; name: string; description: string; mimeType: string };
type ResourceTemplateItem = { uriTemplate: string; name: string; description: string; mimeType: string };
type PromptArg = { name: string; required: boolean; description: string };
type PromptItem = { name: string; title: string; description: string; arguments: PromptArg[] };
type VaardigheidItem = { id: string; uri: string; titel: string; beschrijving: string };
type ExtensieItem = {
  id: string;
  versie: string;
  status: string;
  sep: string;
  standaardAan: boolean;
  risicoWaarschuwing: boolean;
  titel: string;
  samenvatting: string;
};
type SdkVoorbeeld = {
  taal: string;
  naam: string;
  pakket: string;
  repoUrl: string;
  samenvatting: string;
  serverCode: string;
  clientCode: string;
};
type ReceptItem = {
  id: string;
  era: EraModus;
  methode: string;
  params: Record<string, unknown>;
  titel: string;
  uitleg: string;
  cli: string;
  tui: string;
  mcpdo: string;
};

type StudioOverzicht = {
  observedAt: number;
  taal: 'uk' | 'nl';
  actieveRuimte: 'prive' | 'technisch';
  protocol: {
    ondersteundeVersies: string[];
    moderneVersie: string;
    legacyVersie: string;
    eraModi: EraModus[];
  };
  eigenEindpunten: EigenEindpunt[];
  resources: ResourceItem[];
  resourceTemplates: ResourceTemplateItem[];
  prompts: PromptItem[];
  vaardigheden: VaardigheidItem[];
  extensies: ExtensieItem[];
  sdkVoorbeelden: SdkVoorbeeld[];
  recepten: ReceptItem[];
  serverCard: Record<string, unknown>;
  registryServerJson: Record<string, unknown>;
  mcpJsonConfig: Record<string, unknown>;
};

type StrictControle = { code: string; status: 'ok' | 'warn' | 'fout'; bericht: string };

type UitvoerResultaat = {
  ok: boolean;
  duurMs: number;
  era: 'modern' | 'legacy';
  protocolVersie: string;
  doelId: string;
  doelUrl: string;
  verzoekKoppen: Record<string, string>;
  antwoordKoppen?: Record<string, string>;
  rpcVerzoek: Record<string, unknown>;
  rpcAntwoord: Record<string, unknown>;
  strictControles: StrictControle[];
  cliOpdracht?: string;
};

type OAuthStap = { id: string; status: 'ok' | 'fout'; titel: string; detail: string };
type OAuthControleResultaat = {
  ok: boolean;
  doelId: string;
  stappen: OAuthStap[];
  prm: Record<string, unknown>;
  asm: Record<string, unknown>;
};

const STANDAARD_PARAMS: Record<string, Record<string, unknown>> = {
  'server/discover': {},
  initialize: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'mcp-inspector-studio', version: '2.0.0' } },
  ping: {},
  'tools/list': {},
  'tools/call': { name: 'v2_whoami', arguments: {} },
  'resources/list': {},
  'resources/templates/list': {},
  'resources/read': { uri: 'mr://protocol/spec-2026-07-28' },
  'prompts/list': {},
  'prompts/get': { name: 'mcp_beveiligingsaudit', arguments: { doel: 'claude' } },
  'completion/complete': { ref: { type: 'ref/prompt', name: 'mcp_beveiligingsaudit' }, argument: { name: 'doel', value: 'ant' } },
  'subscriptions/listen': {},
  'logging/setLevel': { level: 'info' },
};

const METHODEN: Array<{ id: string; labelUk: string; labelNl: string }> = [
  { id: 'server/discover', labelUk: 'server/discover (виявлення 2026-07-28)', labelNl: 'server/discover (ontdekking 2026-07-28)' },
  { id: 'initialize', labelUk: 'initialize (класичне рукостискання)', labelNl: 'initialize (klassieke handshake)' },
  { id: 'ping', labelUk: 'ping (перевірка зв’язку)', labelNl: 'ping (verbindingscontrole)' },
  { id: 'tools/list', labelUk: 'tools/list (каталог інструментів)', labelNl: 'tools/list (hulpmiddelencatalogus)' },
  { id: 'tools/call', labelUk: 'tools/call (безпечний виклик whoami)', labelNl: 'tools/call (veilige aanroep whoami)' },
  { id: 'resources/list', labelUk: 'resources/list (ресурси mr://*)', labelNl: 'resources/list (bronnen mr://*)' },
  { id: 'resources/templates/list', labelUk: 'resources/templates/list (шаблони URI)', labelNl: 'resources/templates/list (URI-sjablonen)' },
  { id: 'resources/read', labelUk: 'resources/read (читання ресурсу)', labelNl: 'resources/read (bron lezen)' },
  { id: 'prompts/list', labelUk: 'prompts/list (шаблони запитів)', labelNl: 'prompts/list (promptsjablonen)' },
  { id: 'prompts/get', labelUk: 'prompts/get (отримання шаблону запиту)', labelNl: 'prompts/get (prompt ophalen)' },
  { id: 'completion/complete', labelUk: 'completion/complete (автодоповнення)', labelNl: 'completion/complete (aanvulling)' },
  { id: 'subscriptions/listen', labelUk: 'subscriptions/listen (потік підписок 2026-07-28)', labelNl: 'subscriptions/listen (abonnementsstroom 2026-07-28)' },
  { id: 'logging/setLevel', labelUk: 'logging/setLevel (рівень журналювання)', labelNl: 'logging/setLevel (logniveau)' },
];

export default function McpInspectorStudio({ tr }: { tr: Tr }) {
  const [overzicht, setOverzicht] = useState<StudioOverzicht | null>(null);
  const [doelId, setDoelId] = useState('claude');
  const [era, setEra] = useState<EraModus>('modern');
  const [methode, setMethode] = useState('server/discover');
  const [paramsTekst, setParamsTekst] = useState(() => JSON.stringify(STANDAARD_PARAMS['server/discover'], null, 2));
  const [uitvoerBezig, setUitvoerBezig] = useState(false);
  const [uitvoerRes, setUitvoerRes] = useState<UitvoerResultaat | null>(null);
  const [oauthBezig, setOauthBezig] = useState(false);
  const [oauthRes, setOauthRes] = useState<OAuthControleResultaat | null>(null);
  const [sdkTaal, setSdkTaal] = useState('typescript');
  const [gekopieerd, setGekopieerd] = useState('');
  const [fout, setFout] = useState('');

  const laadOverzicht = useCallback(async () => {
    try {
      const res = await api.post('/api/owner/mcp-inspector/overzicht', sessionBody());
      setOverzicht(res.data as StudioOverzicht);
      setFout('');
    } catch (e) {
      setFout(String((e as Error)?.message || 'MCP_INSPECTOR_LOAD_FAILED'));
    }
  }, []);

  useEffect(() => {
    void laadOverzicht();
  }, [laadOverzicht]);

  const kiesMethode = (nieuweMethode: string) => {
    setMethode(nieuweMethode);
    const standaard = STANDAARD_PARAMS[nieuweMethode] ?? {};
    setParamsTekst(JSON.stringify(standaard, null, 2));
  };

  const voerVerzoekUit = async (override?: { doelId?: string; era?: EraModus; methode?: string; params?: Record<string, unknown> }) => {
    setUitvoerBezig(true);
    setFout('');
    try {
      let geparsteParams: Record<string, unknown> = {};
      if (override?.params) {
        geparsteParams = override.params;
      } else if (paramsTekst.trim()) {
        const p = JSON.parse(paramsTekst);
        if (p && typeof p === 'object' && !Array.isArray(p)) geparsteParams = p as Record<string, unknown>;
      }
      const res = await api.post('/api/owner/mcp-inspector/uitvoeren', {
        ...sessionBody(),
        doelId: override?.doelId ?? doelId,
        era: override?.era ?? era,
        methode: override?.methode ?? methode,
        params: geparsteParams,
      });
      setUitvoerRes(res.data as UitvoerResultaat);
    } catch (e) {
      setFout(String((e as Error)?.message || 'MCP_INSPECTOR_EXEC_FAILED'));
    } finally {
      setUitvoerBezig(false);
    }
  };

  const voerOAuthControleUit = async () => {
    setOauthBezig(true);
    setFout('');
    try {
      const res = await api.post('/api/owner/mcp-inspector/oauth-controle', {
        ...sessionBody(),
        doelId,
      });
      setOauthRes(res.data as OAuthControleResultaat);
    } catch (e) {
      setFout(String((e as Error)?.message || 'MCP_OAUTH_CHECK_FAILED'));
    } finally {
      setOauthBezig(false);
    }
  };

  const kopieer = async (sleutel: string, tekst: string) => {
    try {
      await navigator.clipboard.writeText(tekst);
      setGekopieerd(sleutel);
      window.setTimeout(() => setGekopieerd((huidig) => (huidig === sleutel ? '' : huidig)), 2000);
    } catch {
      /* ігноруємо відмову буфера обміну */
    }
  };

  const gekozenSdk = overzicht?.sdkVoorbeelden.find((s) => s.taal === sdkTaal) ?? overzicht?.sdkVoorbeelden[0] ?? null;

  return (
    <section className='ag-blok' data-mcp-inspector-studio='1'>
      <header className='ag-blok-kop'>
        <h3 className='ag-blok-titel'>
          <Terminal aria-hidden='true' />{' '}
          {tr(
            'Інспектор, Студія та Реєстр MCP (2026-07-28 + 2025-11-25)',
            'MCP Inspector, Studio & Register (2026-07-28 + 2025-11-25)',
          )}
          <Badge toon='ok' data='mcp-era'>2026-07-28</Badge>
          <Badge toon='info' data='mcp-legacy'>2025-11-25</Badge>
        </h3>
        <p className='ag-blok-uitleg'>
          {tr(
            'Перевіряйте кінцеві точки кожного агента в сучасній безстановій епосі (2026-07-28: server/discover + _meta) та класичній епосі (2025-11-25: initialize), запускайте готові рецепти інспектора, перевіряйте захист OAuth 2.1 (PKCE S256, CIMD, Origin 403, RFC 9728, RFC 9207) і переглядайте ресурси mr://*, шаблони запитів, навички та зразки SDK.',
            'Test de eindpunten van elke agent in het moderne staatloze tijdperk (2026-07-28: server/discover + _meta) en het klassieke tijdperk (2025-11-25: initialize), voer kant-en-klare inspectorrecepten uit, controleer de OAuth 2.1-beveiliging (PKCE S256, CIMD, Origin 403, RFC 9728, RFC 9207) en bekijk mr://*-bronnen, promptsjablonen, vaardigheden en SDK-voorbeelden.',
          )}
        </p>
      </header>

      {fout ? (
        <p className='ag-melding ag-melding-fout' role='alert' data-inspector-fout='1'>
          {fout}
        </p>
      ) : null}

      {/* 1. Інтерактивний вебінспектор */}
      <div className='ag-kaart' data-inspector-console='1'>
        <div className='ag-kaart-kop'>
          <h4>
            {tr('1. Інтерактивний інспектор протоколу (--strict)', '1. Interactieve protocol-inspector (--strict)')}
          </h4>
          {overzicht ? (
            <Badge toon={overzicht.actieveRuimte === 'technisch' ? 'info' : 'ok'} data='actieve-ruimte'>
              {overzicht.actieveRuimte === 'technisch'
                ? tr('Активний простір: технічний', 'Actieve ruimte: technisch')
                : tr('Активний простір: приватний', 'Actieve ruimte: privé')}
            </Badge>
          ) : null}
        </div>

        <div className='ag-formraster'>
          <label className='ag-veld'>
            <span>{tr('Кінцева точка агента', 'Agenteindpunt')}</span>
            <select value={doelId} onChange={(e) => setDoelId(e.target.value)} data-inspector-veld='doel'>
              {(overzicht?.eigenEindpunten ?? [{ id: 'claude', naam: 'Claude', url: 'https://mcp.tarasevych.com/claude', verbonden: false, actieveTools: 0 }]).map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.naam} ({ep.url.replace('https://mcp.tarasevych.com', '')})
                </option>
              ))}
            </select>
          </label>

          <div className='ag-veld'>
            <span>{tr('Епоха протоколу (--protocol-era)', 'Protocoltijdperk (--protocol-era)')}</span>
            <Segment<EraModus>
              waarde={era}
              label={tr('Епоха протоколу', 'Protocoltijdperk')}
              onKies={(id) => setEra(id)}
              opties={[
                { id: 'modern', label: tr('Сучасна (2026-07-28)', 'Modern (2026-07-28)') },
                { id: 'legacy', label: tr('Класична (2025-11-25)', 'Klassiek (2025-11-25)') },
                { id: 'auto', label: tr('Авто', 'Auto') },
              ]}
            />
          </div>

          <label className='ag-veld ag-veld-vol'>
            <span>{tr('Метод JSON-RPC', 'JSON-RPC-methode')}</span>
            <select value={methode} onChange={(e) => kiesMethode(e.target.value)} data-inspector-veld='methode'>
              {METHODEN.map((m) => (
                <option key={m.id} value={m.id}>
                  {tr(m.labelUk, m.labelNl)}
                </option>
              ))}
            </select>
          </label>

          <label className='ag-veld ag-veld-vol'>
            <span>{tr('Параметри запиту (JSON)', 'Verzoekparameters (JSON)')}</span>
            <textarea
              rows={3}
              value={paramsTekst}
              onChange={(e) => setParamsTekst(e.target.value)}
              data-inspector-veld='params'
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '.82rem' }}
            />
          </label>
        </div>

        <div className='ag-knoppen'>
          <Knop
            toon='primary'
            icoon={<Play />}
            bezig={uitvoerBezig}
            onClick={() => void voerVerzoekUit()}
            data='inspector-uitvoeren'
          >
            {tr('Виконати запит і перевірити (--strict)', 'Verzoek uitvoeren en controleren (--strict)')}
          </Knop>
          <Knop
            icoon={<ShieldCheck />}
            bezig={oauthBezig}
            onClick={() => void voerOAuthControleUit()}
            data='inspector-oauth-controle'
          >
            {tr('Перевірити безпеку OAuth 2.1 (7 кроків)', 'OAuth 2.1-beveiliging testen (7 stappen)')}
          </Knop>
          <Knop icoon={<RefreshCw />} onClick={() => void laadOverzicht()} data='inspector-ververs'>
            {tr('Оновити дані студії', 'Studiogegevens verversen')}
          </Knop>
        </div>

        {uitvoerRes ? (
          <div className='ag-kaart' data-inspector-uitkomst={uitvoerRes.ok ? 'ok' : 'fout'}>
            <div className='ag-kaart-kop'>
              <h4>
                {tr('Результат перевірки інспектора', 'Resultaat van de inspectorcontrole')}{' '}
                <Badge toon={uitvoerRes.ok ? 'ok' : 'bad'} data='rpc-status'>
                  {uitvoerRes.ok ? tr('УСПІШНО', 'GESLAAGD') : tr('ПОМИЛКА RPC', 'RPC-FOUT')}
                </Badge>{' '}
                <Badge toon='info' data='rpc-era'>
                  {uitvoerRes.protocolVersie} ({uitvoerRes.era})
                </Badge>{' '}
                <Badge toon='off' data='rpc-duur'>
                  {uitvoerRes.duurMs} {tr('мс', 'ms')}
                </Badge>
              </h4>
              {uitvoerRes.cliOpdracht ? (
                <Knop
                  icoon={gekopieerd === 'cli-actueel' ? <Check /> : <Copy />}
                  onClick={() => void kopieer('cli-actueel', uitvoerRes.cliOpdracht!)}
                  data='kopieer-cli-actueel'
                >
                  {gekopieerd === 'cli-actueel' ? tr('Скопійовано', 'Gekopieerd') : tr('Скопіювати команду CLI', 'CLI-opdracht kopiëren')}
                </Knop>
              ) : null}
            </div>

            <ul className='ag-sublijst' data-lijst='strict-controles'>
              {uitvoerRes.strictControles.map((c) => (
                <li key={c.code} className='ag-subrij' data-strict-code={c.code}>
                  <div>
                    <Badge toon={c.status === 'ok' ? 'ok' : c.status === 'warn' ? 'warn' : 'bad'}>{c.code}</Badge>{' '}
                    <span>{c.bericht}</span>
                  </div>
                </li>
              ))}
            </ul>

            <Tech
              rijen={[
                [tr('Цільова адреса', 'Doeladres'), <code>{uitvoerRes.doelUrl}</code>],
                [tr('Заголовки запиту', 'Verzoekkoppen'), <code>{JSON.stringify(uitvoerRes.verzoekKoppen)}</code>],
                [
                  tr('Тіло запиту JSON-RPC', 'JSON-RPC-verzoek'),
                  <pre className='ag-ruw'>{JSON.stringify(uitvoerRes.rpcVerzoek, null, 2)}</pre>,
                ],
                [
                  tr('Відповідь сервера JSON-RPC', 'JSON-RPC-antwoord van de server'),
                  <pre className='ag-ruw'>{JSON.stringify(uitvoerRes.rpcAntwoord, null, 2)}</pre>,
                ],
              ]}
            />
          </div>
        ) : null}

        {oauthRes ? (
          <div className='ag-kaart' data-inspector-oauth-uitkomst={oauthRes.ok ? 'ok' : 'fout'}>
            <div className='ag-kaart-kop'>
              <h4>
                {tr('Жива перевірка безпеки OAuth 2.1 та захисту конектора', 'Levende OAuth 2.1- en connectorbeveiligingscontrole')}{' '}
                <Badge toon={oauthRes.ok ? 'ok' : 'bad'}>
                  {oauthRes.ok ? tr('УСІ 7 ПЕРЕВІРОК ПРОЙДЕНО', 'ALLE 7 CONTROLES GESLAAGD') : tr('Є ЗАУВАЖЕННЯ', 'AANDACHTSPUNTEN')}
                </Badge>
              </h4>
            </div>
            <ul className='ag-sublijst' data-lijst='oauth-stappen'>
              {oauthRes.stappen.map((s) => (
                <li key={s.id} className='ag-subrij' data-oauth-stap={s.id}>
                  <div>
                    <Badge toon={s.status === 'ok' ? 'ok' : 'bad'}>{s.status === 'ok' ? 'OK' : 'FOUT'}</Badge>{' '}
                    <b>{s.titel}</b>
                    <p className='ag-meta'><code>{s.detail}</code></p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* 2. Готові рецепти MCP Inspector (Recipes: Web / CLI / TUI / mcpdo) */}
      {overzicht?.recepten.length ? (
        <div className='ag-kaart' data-inspector-recepten='1'>
          <div className='ag-kaart-kop'>
            <h4>
              <Sparkles aria-hidden='true' />{' '}
              {tr('2. Готові рецепти перевірки (MCP Inspector Recipes · CLI · TUI · mcpdo)', '2. Kant-en-klare controlerecepten (MCP Inspector Recipes · CLI · TUI · mcpdo)')}
            </h4>
          </div>
          <ul className='ag-sublijst' data-lijst='inspector-recepten'>
            {overzicht.recepten.map((r) => (
              <li key={r.id} className='ag-subrij' data-recept={r.id}>
                <div>
                  <b>{r.titel}</b>{' '}
                  <Badge toon='info'>{r.era}</Badge>{' '}
                  <code>{r.methode}</code>
                  <p className='ag-meta'>{r.uitleg}</p>
                  <small className='ag-meta'>
                    CLI: <code>{r.cli}</code>
                  </small>
                </div>
                <div className='ag-knoppen'>
                  <Knop
                    toon='primary'
                    icoon={<Play />}
                    bezig={uitvoerBezig}
                    onClick={() => {
                      setEra(r.era);
                      setMethode(r.methode);
                      setParamsTekst(JSON.stringify(r.params, null, 2));
                      void voerVerzoekUit({ doelId, era: r.era, methode: r.methode, params: r.params });
                    }}
                    data={`recept-start:${r.id}`}
                  >
                    {tr('Запустити тут', 'Hier uitvoeren')}
                  </Knop>
                  <Knop
                    icoon={gekopieerd === `cli:${r.id}` ? <Check /> : <Copy />}
                    onClick={() => void kopieer(`cli:${r.id}`, r.cli)}
                    data={`recept-cli:${r.id}`}
                  >
                    {gekopieerd === `cli:${r.id}` ? tr('Скопійовано', 'Gekopieerd') : '--cli'}
                  </Knop>
                  <Knop
                    icoon={gekopieerd === `tui:${r.id}` ? <Check /> : <Copy />}
                    onClick={() => void kopieer(`tui:${r.id}`, r.tui)}
                    data={`recept-tui:${r.id}`}
                  >
                    {gekopieerd === `tui:${r.id}` ? tr('Скопійовано', 'Gekopieerd') : '--tui'}
                  </Knop>
                  <Knop
                    icoon={gekopieerd === `mcpdo:${r.id}` ? <Check /> : <Copy />}
                    onClick={() => void kopieer(`mcpdo:${r.id}`, r.mcpdo)}
                    data={`recept-mcpdo:${r.id}`}
                  >
                    {gekopieerd === `mcpdo:${r.id}` ? tr('Скопійовано', 'Gekopieerd') : 'mcpdo'}
                  </Knop>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 3. Ресурси mr://*, двомовні шаблони запитів (prompts), навички агента (Skills over MCP) та розширення */}
      {overzicht ? (
        <details className='ag-blok ag-blok-uitklap' data-inspector-catalogus='1'>
          <summary className='ag-blok-kop'>
            <h3 className='ag-blok-titel'>
              <BookOpen aria-hidden='true' />{' '}
              {tr(
                `3. Ресурси (${overzicht.resources.length}), шаблони запитів (${overzicht.prompts.length}), навички (${overzicht.vaardigheden.length}) та розширення (${overzicht.extensies.length})`,
                `3. Bronnen (${overzicht.resources.length}), prompts (${overzicht.prompts.length}), vaardigheden (${overzicht.vaardigheden.length}) en extensies (${overzicht.extensies.length})`,
              )}
            </h3>
            <ChevronDown className='ag-chevron' aria-hidden='true' />
          </summary>

          <h4>{tr('Ресурси протоколу (resources/list + resources/read)', 'Protocolbronnen (resources/list + resources/read)')}</h4>
          <ul className='ag-sublijst' data-lijst='mcp-resources'>
            {overzicht.resources.map((res) => (
              <li key={res.uri} className='ag-subrij' data-resource={res.uri}>
                <div>
                  <b><code>{res.uri}</code></b> — {res.name}{' '}
                  <Badge toon='off'>{res.mimeType}</Badge>
                  <p className='ag-meta'>{res.description}</p>
                </div>
                <Knop
                  icoon={<Play />}
                  onClick={() => {
                    setMethode('resources/read');
                    const p = { uri: res.uri };
                    setParamsTekst(JSON.stringify(p, null, 2));
                    void voerVerzoekUit({ doelId, era: 'modern', methode: 'resources/read', params: p });
                  }}
                  data={`lees-resource:${res.uri}`}
                >
                  {tr('Прочитати ресурс', 'Bron lezen')}
                </Knop>
              </li>
            ))}
          </ul>

          <h4>{tr('Двомовні шаблони запитів (prompts/list + prompts/get)', 'Tweetalige promptsjablonen (prompts/list + prompts/get)')}</h4>
          <ul className='ag-sublijst' data-lijst='mcp-prompts'>
            {overzicht.prompts.map((pr) => (
              <li key={pr.name} className='ag-subrij' data-prompt={pr.name}>
                <div>
                  <b><code>{pr.name}</code></b> — {pr.title}
                  <p className='ag-meta'>{pr.description}</p>
                  {pr.arguments.length ? (
                    <small className='ag-meta'>
                      {tr('Аргументи', 'Argumenten')}: {pr.arguments.map((a) => `${a.name}${a.required ? '*' : ''}`).join(', ')}
                    </small>
                  ) : null}
                </div>
                <Knop
                  icoon={<Play />}
                  onClick={() => {
                    setMethode('prompts/get');
                    const p = { name: pr.name, arguments: {} };
                    setParamsTekst(JSON.stringify(p, null, 2));
                    void voerVerzoekUit({ doelId, era: 'modern', methode: 'prompts/get', params: p });
                  }}
                  data={`lees-prompt:${pr.name}`}
                >
                  {tr('Отримати шаблон', 'Sjabloon ophalen')}
                </Knop>
              </li>
            ))}
          </ul>

          <h4>{tr('Офіційні розширення MCP 2026-07-28 (Extensions & SEPs)', 'Officiële MCP 2026-07-28-extensies (Extensions & SEPs)')}</h4>
          <ul className='ag-sublijst' data-lijst='mcp-extensies'>
            {overzicht.extensies.map((ext) => (
              <li key={ext.id} className='ag-subrij' data-extensie={ext.id}>
                <div>
                  <b><code>{ext.id}</code></b> — {ext.titel}{' '}
                  <Badge toon={ext.standaardAan ? 'ok' : 'warn'}>{ext.sep}</Badge>{' '}
                  <Badge toon='info'>{ext.status}</Badge>
                  <p className='ag-meta'>{ext.samenvatting}</p>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {/* 4. Студія SDK (TypeScript, Python, Go, Rust), Server Card та server.json */}
      {overzicht && gekozenSdk ? (
        <details className='ag-blok ag-blok-uitklap' data-inspector-sdk='1'>
          <summary className='ag-blok-kop'>
            <h3 className='ag-blok-titel'>
              <Code2 aria-hidden='true' />{' '}
              {tr(
                '4. Розробка серверів і клієнтів MCP (TypeScript, Python, Go, Rust) та маніфести реєстру',
                '4. Ontwikkeling van MCP-servers en -clients (TypeScript, Python, Go, Rust) en registerbestanden',
              )}
            </h3>
            <ChevronDown className='ag-chevron' aria-hidden='true' />
          </summary>

          <div className='ag-veld'>
            <span>{tr('Оберіть офіційний набір розробки (SDK)', 'Kies een officiële ontwikkelkit (SDK)')}</span>
            <Segment<string>
              waarde={sdkTaal}
              label={tr('Мова SDK', 'SDK-taal')}
              onKies={(id) => setSdkTaal(id)}
              opties={overzicht.sdkVoorbeelden.map((s) => ({ id: s.taal, label: s.naam }))}
            />
          </div>

          <p className='ag-meta'>
            {gekozenSdk.samenvatting} · <code>{gekozenSdk.pakket}</code> ·{' '}
            <a className='ag-link' href={gekozenSdk.repoUrl} target='_blank' rel='noreferrer'>
              {gekozenSdk.repoUrl}
            </a>
          </p>

          <Tech
            rijen={[
              [
                tr('Зразок створення MCP-сервера (Build Server)', 'Voorbeeld van een MCP-server (Build Server)'),
                <div>
                  <Knop
                    icoon={gekopieerd === `sdk-srv:${gekozenSdk.taal}` ? <Check /> : <Copy />}
                    onClick={() => void kopieer(`sdk-srv:${gekozenSdk.taal}`, gekozenSdk.serverCode)}
                  >
                    {gekopieerd === `sdk-srv:${gekozenSdk.taal}` ? tr('Скопійовано', 'Gekopieerd') : tr('Скопіювати код сервера', 'Servercode kopiëren')}
                  </Knop>
                  <pre className='ag-ruw'>{gekozenSdk.serverCode}</pre>
                </div>,
              ],
              [
                tr('Зразок створення MCP-клієнта (Build Client)', 'Voorbeeld van een MCP-client (Build Client)'),
                <div>
                  <Knop
                    icoon={gekopieerd === `sdk-cli:${gekozenSdk.taal}` ? <Check /> : <Copy />}
                    onClick={() => void kopieer(`sdk-cli:${gekozenSdk.taal}`, gekozenSdk.clientCode)}
                  >
                    {gekopieerd === `sdk-cli:${gekozenSdk.taal}` ? tr('Скопійовано', 'Gekopieerd') : tr('Скопіювати код клієнта', 'Clientcode kopiëren')}
                  </Knop>
                  <pre className='ag-ruw'>{gekozenSdk.clientCode}</pre>
                </div>,
              ],
              [
                tr('Конфігурація підключення локальних та віддалених клієнтів (mcp.json)', 'Verbindingsconfiguratie voor lokale en externe clients (mcp.json)'),
                <div>
                  <Knop
                    icoon={gekopieerd === 'mcp-json' ? <Check /> : <Copy />}
                    onClick={() => void kopieer('mcp-json', JSON.stringify(overzicht.mcpJsonConfig, null, 2))}
                  >
                    {gekopieerd === 'mcp-json' ? tr('Скопійовано', 'Gekopieerd') : tr('Скопіювати mcp.json', 'mcp.json kopiëren')}
                  </Knop>
                  <pre className='ag-ruw'>{JSON.stringify(overzicht.mcpJsonConfig, null, 2)}</pre>
                </div>,
              ],
              [
                tr('Картка сервера (/.well-known/mcp.json · ext-server-card)', 'Serverkaart (/.well-known/mcp.json · ext-server-card)'),
                <pre className='ag-ruw'>{JSON.stringify(overzicht.serverCard, null, 2)}</pre>,
              ],
              [
                tr('Опис для реєстру MCP (/server.json · MCP Registry)', 'Beschrijving voor het MCP-register (/server.json · MCP Registry)'),
                <pre className='ag-ruw'>{JSON.stringify(overzicht.registryServerJson, null, 2)}</pre>,
              ],
            ]}
          />
        </details>
      ) : null}
    </section>
  );
}
