// «Один ШІ — одна вкладка» (скарга власника 20.10.2026): ÉÉN pagina per AI-agent, in de hub «Підключення ШІ».
//
// Waarom: het beheer van één AI stond verspreid over vijf tabbladen (Конектори = adres en rechten, Токени = token en manier van
// verbinden, Доступи = ruimte, Розширення = kleur, Журнал = geschiedenis). Wie Grok wilde instellen, moest vier keer opnieuw
// kiezen welke AI het was. Hier staat alles van ÉÉN agent bij elkaar, in de volgorde waarin een mens het nodig heeft:
//   1. Підключити — de GROTE knop en de stappen voor juist deze client (src/agenten/verbind-recepten.ts: deeplink van Cursor en
//      VS Code, opdracht van Claude Code, instellingen van claude.ai en ChatGPT; eerlijk waar de maker niets toelaat) én de WARE
//      stand: v2-koppelingen, de erfenis van het oude /mcp en de serverdeur («стара дорога — перепідключіть»);
//   2. Дозволи — dezelfde kiezer als in het toestemmingsvenster (src/connector-v2/RechtenKiezer.tsx) met herverbinden/intrekken;
//   3. Простір — welke kanten zijn toegestaan en welke NU leven (de levende poort van de server, aiPoortNu);
//   4. Спосіб зв'язку й токени — alleen voor clients die een Authorization-kop willen; ingeklapt, want waar OAuth bestaat is dit de
//      oude weg;
//   5. Колір агента — hergebruikt src/agenten/AgentKleuren.tsx (geen tweede kopie van die lijst);
//   6. Журнал — alleen de gebeurtenissen van deze agent.
// Er komt GEEN nieuwe pagina bij: dit is een plek in de bestaande hub (#agent/<slug>). De algemene tabbladen blijven voor wat
// echt gedeeld is (apparaten, externe MCP-servers, de browserextensie, het hele journaal).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowLeft, Check, ExternalLink, Fingerprint, KeyRound, Link2, Palette, Pause, Play, Plug, ShieldCheck, SlidersHorizontal, Trash2, UserRound, Wrench, Zap } from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody } from '../agenten-gegevens';
import { canonicalNavigationUrl } from '../canoniek-navigatie';
import type { Tr } from '../mcp-ui';
import { agentUrl, oudAgentUrl, OUD_GEDEELD_URL, v2Agent, type AgentSlug } from '../../shared/connector-v2/agenten';
import { RUIMTE_NAAM, RUIMTE_UITLEG } from '../../shared/ai-ruimte';
import { WEIGER_UITLEG, type AgentToegangDiagnose } from '../../shared/ai-toegang-diagnose';
import { STAND_NAAM } from '../../shared/ruimte-scheiding';
import { agentSlugUitNaam } from '../../shared/markering-agenten';
import { KANT_TEKST, type Kant } from '../../shared/connector-v2/catalogus';
import { STANDAARD, schoon } from '../../shared/connector-v2/rechten';
import { levendeKanten, SOORT_TEKST, zichtbareSleutels, type VerbindingSoort } from '../../shared/connector-v2/stand';
import { AgentInstellingen, agentVanItem, standVanAgent, type AgentStand, type Data } from '../connector-v2/ConnectorsTab';
import { openTechVenster, techVernieuwen, useTech } from '../tech/tech-opslag';
import { ruimtesVernieuwen, useRuimtes, wissel } from '../tech/ruimtes/ruimtes-opslag';
import { restTekst } from '../tech/ruimtes/teksten';
import AgentKleuren from './AgentKleuren';
import AgentLogo from './AgentLogo';
import AgentVerbinden from './AgentVerbinden';
import { ondertekenAgentBeleidInPlaats } from './beleid-ondertekenen';
import TabTokens from './TabTokens';
import { JournaalLijst } from './Journaal';
import { inRuimte, isoMs, useDeurTokens, useJournaal } from './gegevens';
import { foutTekst } from './fouten';
import { GevaarKnop, Melding, useActies } from './ui';
import BevestigingenPaneel from '../ai-bevestiging/BevestigingenPaneel';

const wanneer = (ms: number | null | undefined, uk: boolean) => (ms ? new Date(ms).toLocaleString(uk ? 'uk-UA' : 'nl-BE', { dateStyle: 'short', timeStyle: 'short' }) : (uk ? 'ще не було' : 'nog niet'));

type Rij = { sleutel: string; soort: VerbindingSoort; naam: string; kanten: Kant[]; sleutels: number; laatst: number | null; tot: number | null; id: string };

/** Alle verbindingen van deze ene AI, langs welke weg dan ook, als één lijst (nieuwste gebruik eerst). */
function rijenVan(a: AgentStand): Rij[] {
  const uit: Rij[] = [
    ...a.koppelingen.map((k): Rij => ({ sleutel: `v2:${k.id}`, soort: 'v2', naam: k.clientName, kanten: k.kanten, sleutels: k.sleutels.length, laatst: k.lastUsedAt, tot: k.expiresAt, id: k.id })),
    ...(a.erfenis ?? []).map((g): Rij => ({ sleutel: `mcp:${g.id}`, soort: 'erfenis', naam: g.clientName, kanten: [g.ruimte === 'technisch' ? 'beheer' : 'gebruiker'], sleutels: 0, laatst: g.lastUsedAt, tot: g.expiresAt, id: g.id })),
    ...(a.deur ?? []).map((d): Rij => ({ sleutel: `deur:${d.id}`, soort: 'deur', naam: `${d.klant}${d.deur ? ` · /${d.deur}` : ''}`, kanten: ['beheer'], sleutels: 0, laatst: d.laatst || null, tot: d.refreshTot || null, id: d.id })),
  ];
  return uit.sort((x, y) => (y.laatst ?? 0) - (x.laatst ?? 0));
}

/** Voorwaarde-per-voorwaarde gereedheid en 1-klik acties voor één agent (MCP-ACCESS-001).
 *  Regel: bied NOOIT een «Увімкнути / Дозволити»-knop aan voor een voorwaarde die al actief is — toon dan een groene actieve badge
 *  met resterende tijd en hoogstens een secundaire «Призупинити / Зняти / Вимкнути»-actie. */
function AgentToegangGereedheid({
  tr, uk, slug, naam, diag, kanten, doelSleutels, naWijziging,
}: {
  tr: Tr; uk: boolean; slug: AgentSlug; naam: string; diag: AgentToegangDiagnose; kanten: Kant[]; doelSleutels: readonly string[]; naWijziging: () => Promise<void>;
}) {
  const taal: 'uk' | 'nl' = uk ? 'uk' : 'nl';
  const [bezig, setBezig] = useState('');
  const [bericht, setBericht] = useState<{ ok: boolean; tekst: string } | null>(null);
  const nu = Date.now();
  const doelGrantId = diag.connectionGranted.grantId || '*';
  const wilBeheer = kanten.includes('beheer') || diag.connectionGranted.kanten.includes('beheer');

  const voerActieUit = async (sleutel: string, fn: () => Promise<string>) => {
    setBezig(sleutel);
    setBericht(null);
    try {
      const tekst = await fn();
      await Promise.all([techVernieuwen().catch(() => undefined), ruimtesVernieuwen().catch(() => undefined), naWijziging()]);
      setBericht({ ok: true, tekst });
    } catch (e) {
      const code = String((e as Error)?.message || 'FOUT');
      setBericht({
        ok: false,
        tekst: /STEP_UP|NotAllowedError/.test(code)
          ? tr('Підтвердження скасовано — стан не змінено.', 'Bevestiging geannuleerd — de staat is niet gewijzigd.')
          : foutTekst(e, tr, ['Дію не виконано', 'Actie mislukt']),
      });
    } finally {
      setBezig('');
    }
  };

  const sessieRest = restTekst(diag.profileSessionEnd, nu, taal);
  const delegatieRest = restTekst(diag.aiSessionDelegationEnd, nu, taal);
  const dienstActief = diag.aiServiceState === 'eigen' || diag.aiServiceState === 'gedeeld';
  const beleidBlokkeert = diag.aiPolicyBlockedCount > 0 || diag.aiPolicyState === 'ongeldig' || diag.aiPolicyState === 'agent-onbekend' || diag.aiPolicyState === 'agent-uit' || diag.aiPolicyState === 'verlopen' || diag.aiPolicyState === 'uit';
  const adminAiHref = canonicalNavigationUrl('admin', 'ai', taal);
  const githubHref = canonicalNavigationUrl('github', 'accounts', taal);

  return (
    <div className='ag-diagnose' id={`ag-agent-gereedheid-${slug}`} data-agent-diagnose={diag.denialCode ?? 'OK'} data-agent-zichtbaar-echt={diag.effectiveVisibleToolsCount}>
      <div className='ag-diagnose-kop'>
        <div>
          <h4>{tr('Фактична готовність інструментів зараз', 'Werkelijke beschikbaarheid van hulpmiddelen nu')}</h4>
          <p className='hub-meta'>
            {diag.connectionGranted.verbonden
              ? tr(
                  `Зараз ${naam} реально бачить у списку MCP: ${diag.effectiveVisibleToolsCount} із ${diag.connectionGranted.totaal} наданих інструментів (приватних: ${diag.effectiveGebruikerVisibleCount}/${diag.connectionGranted.gebruiker}${wilBeheer ? `, технічних _beheer: ${diag.effectiveBeheerVisibleCount}/${diag.connectionGranted.beheer}` : ''}).`,
                  `Nu ziet ${naam} daadwerkelijk in de MCP-lijst: ${diag.effectiveVisibleToolsCount} van ${diag.connectionGranted.totaal} toegekende hulpmiddelen (privé: ${diag.effectiveGebruikerVisibleCount}/${diag.connectionGranted.gebruiker}${wilBeheer ? `, technisch _beheer: ${diag.effectiveBeheerVisibleCount}/${diag.connectionGranted.beheer}` : ''}).`,
                )
              : tr(
                  `Підключення OAuth для ${naam} ще немає; нижче показано поточний стан умов на сервері.`,
                  `Er is nog geen actieve OAuth-koppeling voor ${naam}; hieronder staat de huidige staat van de voorwaarden op de server.`,
                )}
          </p>
        </div>
        <span className={`ag-badge ${diag.denialCode ? 'ag-warn' : 'ag-ok'}`} data-diagnose-hoofdcode={diag.denialCode ?? 'OK'}>
          {diag.denialCode ? <AlertTriangle size={13} aria-hidden='true' /> : <Check size={13} aria-hidden='true' />}
          {diag.denialCode ? diag.denialCode : tr('Усі умови виконано', 'Alle voorwaarden vervuld')}
        </span>
      </div>

      {bericht ? (
        <p className={`ag-melding ${bericht.ok ? 'ag-melding-ok' : 'ag-melding-fout'}`} role='status' data-diagnose-melding='1'>
          {bericht.ok ? <Check size={15} aria-hidden='true' /> : <AlertTriangle size={15} aria-hidden='true' />}
          <span>{bericht.tekst}</span>
        </p>
      ) : null}

      <ul className='ag-diagnose-lijst'>
        {/* 1. Technische sessie van de eigenaar */}
        {diag.eigenaar && (wilBeheer || diag.profileSessionActive || diag.profileSessionPaused) ? (
          <li className='ag-diagnose-rij' data-diagnose-laag='sessie' data-diagnose-staat={diag.profileSessionActive ? 'actief' : diag.profileSessionPaused ? 'pauze' : 'uit'}>
            <div className='ag-diagnose-info'>
              <div className='ag-diagnose-titel'>
                <b>{tr('1. Технічний сеанс власника', '1. Technische sessie van de eigenaar')}</b>
                {diag.profileSessionActive ? (
                  <span className='ag-badge ag-ok'><Check size={12} aria-hidden='true' />{tr('Активний', 'Actief')}{sessieRest ? ` · ${sessieRest}` : ''}</span>
                ) : diag.profileSessionPaused ? (
                  <span className='ag-badge ag-warn'><Pause size={12} aria-hidden='true' />{tr('На паузі', 'Op pauze')}</span>
                ) : (
                  <span className='ag-badge ag-off'>{tr('Не запущений', 'Niet gestart')}</span>
                )}
              </div>
              <small className='hub-meta'>
                {diag.profileSessionActive
                  ? tr('Ваш технічний простір зараз відкритий.', 'Uw technische ruimte is nu geopend.')
                  : diag.profileSessionPaused
                    ? WEIGER_UITLEG.PAUZE[taal]
                    : WEIGER_UITLEG.GEEN_TECH_SESSIE[taal]}
              </small>
            </div>
            <div className='ag-diagnose-acties'>
              {diag.profileSessionActive ? (
                <>
                  {diag.techV2Active ? (
                    <button type='button' className='ag-knop' disabled={!!bezig} data-diagnose-actie='pauzeer_tech_sessie'
                      onClick={() => void voerActieUit('pauzeer', async () => { await wissel('prive'); return tr('Технічний простір поставлено на паузу.', 'Technische ruimte op pauze gezet.'); })}>
                      <Pause size={14} aria-hidden='true' />{tr('Поставити на паузу', 'Pauzeren')}
                    </button>
                  ) : null}
                  <button type='button' className='ag-knop' disabled={!!bezig} data-diagnose-actie='open_tech_termijnen' onClick={() => openTechVenster('toegang')}>
                    <SlidersHorizontal size={14} aria-hidden='true' />{tr('Терміни', 'Termijnen')}
                  </button>
                </>
              ) : diag.profileSessionPaused ? (
                <button type='button' className='ag-knop ag-knop-primary' disabled={!!bezig} data-diagnose-actie='hervat_tech_sessie'
                  onClick={() => void voerActieUit('hervat', async () => { await wissel('technisch'); return tr('Технічний сеанс відновлено з паузи.', 'Technische sessie hervat.'); })}>
                  <Play size={14} aria-hidden='true' />{tr('Відновити з паузи', 'Hervatten uit pauze')}
                </button>
              ) : (
                <button type='button' className='ag-knop ag-knop-primary' disabled={!!bezig} data-diagnose-actie='start_tech_sessie'
                  onClick={() => openTechVenster('activeren')}>
                  <Wrench size={14} aria-hidden='true' />{tr('Увімкнути технічний простір', 'Technische ruimte starten')}
                </button>
              )}
            </div>
          </li>
        ) : null}

        {/* 2. Per-verbinding AI-sessiedelegatie (tech-ruimtes-v2) */}
        {diag.eigenaar && diag.techV2Active && wilBeheer ? (
          <li className='ag-diagnose-rij' data-diagnose-laag='delegatie' data-diagnose-staat={diag.aiSessionDelegationActive ? 'actief' : 'uit'}>
            <div className='ag-diagnose-info'>
              <div className='ag-diagnose-titel'>
                <b>{tr(`2. Доступ ${naam} до технічного сеансу`, `2. Toegang van ${naam} tot technische sessie`)}</b>
                {diag.aiSessionDelegationActive ? (
                  <span className='ag-badge ag-ok'>
                    <Check size={12} aria-hidden='true' />
                    {diag.aiSessionDelegationScope === 'verbinding' ? tr('Дозволено цьому агенту', 'Toegestaan voor deze agent') : tr('Дозволено', 'Toegestaan')}
                    {delegatieRest ? ` · ${delegatieRest}` : ''}
                  </span>
                ) : (
                  <span className='ag-badge ag-warn'>{tr('Не дозволено для сеансу', 'Niet toegestaan voor sessie')}</span>
                )}
              </div>
              <small className='hub-meta'>
                {diag.aiSessionDelegationActive
                  ? tr(`Делегування активне лише на вказаний термін і не зачіпає інших ШІ-агентів.`, `Delegatie geldt alleen voor de gekozen termijn en lekt niet naar andere AI-agents.`)
                  : WEIGER_UITLEG.AI_NIET_TOEGESTAAN[taal]}
              </small>
            </div>
            <div className='ag-diagnose-acties'>
              {diag.aiSessionDelegationActive ? (
                <button type='button' className='ag-knop' disabled={!!bezig} data-diagnose-actie='trek_ai_sessie_in'
                  onClick={() => void voerActieUit('delegatie-uit', async () => {
                    await api.post('/api/owner/connector-v2/activeer-tech', { ...sessionBody(), agent: slug, actie: 'delegatie-uit', verbindingId: doelGrantId });
                    return tr(`Технічний доступ сеансу для ${naam} знято (залишено лише звичайний простір).`, `Technische sessietoegang voor ${naam} ingetrokken (alleen gewone ruimte blijft).`);
                  })}>
                  {tr('Залишити лише звичайний простір', 'Alleen gewone ruimte laten')}
                </button>
              ) : (
                <>
                  <button type='button' className='ag-knop ag-knop-primary' disabled={!!bezig} data-diagnose-actie='zet_ai_sessie_einde'
                    onClick={() => void voerActieUit('delegatie-einde', async () => {
                      await api.post('/api/owner/connector-v2/activeer-tech', {
                        ...sessionBody(),
                        agent: slug,
                        actie: 'alles-aan',
                        verbindingId: doelGrantId,
                        termijn: 'tot-technisch-einde',
                      });
                      return tr(`Технічний простір дозволено для ${naam} до завершення технічного сеансу.`, `Technische ruimte toegestaan voor ${naam} tot het einde van de technische sessie.`);
                    })}>
                    <Zap size={14} aria-hidden='true' />{tr('Дозволити до кінця сеансу', 'Toestaan tot einde sessie')}
                  </button>
                  <button type='button' className='ag-knop' disabled={!!bezig} data-diagnose-actie='zet_ai_sessie_60'
                    onClick={() => void voerActieUit('delegatie-60', async () => {
                      await api.post('/api/owner/connector-v2/activeer-tech', {
                        ...sessionBody(),
                        agent: slug,
                        actie: 'alles-aan',
                        verbindingId: doelGrantId,
                        termijn: 'tijd',
                        minuten: 60,
                      });
                      return tr(`Технічний простір дозволено для ${naam} на 1 годину.`, `Technische ruimte toegestaan voor ${naam} voor 1 uur.`);
                    })}>
                    {tr('На 1 год', 'Voor 1 uur')}
                  </button>
                </>
              )}
            </div>
          </li>
        ) : null}

        {/* 3. Dienst «AI-koppelingen» in technische gegevensruimte */}
        {diag.eigenaar && wilBeheer ? (
          <li className='ag-diagnose-rij' data-diagnose-laag='dienst' data-diagnose-staat={dienstActief ? 'actief' : diag.aiServiceState}>
            <div className='ag-diagnose-info'>
              <div className='ag-diagnose-titel'>
                <b>{tr('3. Служба «Підключення ШІ» у технічному просторі даних', '3. Dienst «AI-koppelingen» in technische gegevensruimte')}</b>
                {dienstActief ? (
                  <span className='ag-badge ag-ok'><Check size={12} aria-hidden='true' />{STAND_NAAM[diag.aiServiceState][taal]}</span>
                ) : diag.aiServiceState === 'bevroren' ? (
                  <span className='ag-badge ag-bad'>{STAND_NAAM.bevroren[taal]}</span>
                ) : (
                  <span className='ag-badge ag-warn'>{!diag.ruimteKeuzeGemaakt ? tr('Вибір ще не зроблено', 'Keuze ontbreekt') : STAND_NAAM.uit[taal]}</span>
                )}
              </div>
              <small className='hub-meta'>
                {dienstActief
                  ? tr('Служба активна у технічному просторі даних.', 'De dienst staat aan in de technische gegevensruimte.')
                  : !diag.ruimteKeuzeGemaakt
                    ? WEIGER_UITLEG.KEUZE_ONTBREEKT[taal]
                    : diag.aiServiceState === 'bevroren'
                      ? WEIGER_UITLEG.BEVROREN[taal]
                      : WEIGER_UITLEG.DIENST_UIT[taal]}
              </small>
            </div>
            <div className='ag-diagnose-acties'>
              {dienstActief ? (
                <button type='button' className='ag-knop' disabled={!!bezig} data-diagnose-actie='zet_ai_dienst_uit'
                  onClick={() => void voerActieUit('dienst-uit', async () => {
                    await api.post('/api/owner/connector-v2/activeer-tech', { ...sessionBody(), agent: slug, actie: 'dienst-uit' });
                    return tr('Службу «Підключення ШІ» від’єднано від технічного простору.', 'Dienst «AI-koppelingen» losgemaakt uit de technische ruimte.');
                  })}>
                  {tr("Від'єднати службу", 'Dienst losmaken')}
                </button>
              ) : diag.aiServiceState === 'bevroren' ? (
                <a className='ag-knop ag-knop-primary' href='#technisch' data-diagnose-actie='ontvries_ai_dienst'>
                  {tr('Відкрити «Технічне» для рішення', 'Open «Technisch» voor besluit')}
                </a>
              ) : (
                <>
                  <button type='button' className='ag-knop ag-knop-primary' disabled={!!bezig} data-diagnose-actie='zet_ai_dienst_eigen'
                    onClick={() => void voerActieUit('dienst-eigen', async () => {
                      await api.post('/api/owner/connector-v2/activeer-tech', { ...sessionBody(), agent: slug, actie: 'dienst-eigen' });
                      return tr('Службу «Підключення ШІ» увімкнено у технічному просторі (окремі дані).', 'Dienst «AI-koppelingen» aangezet in de technische ruimte (eigen gegevens).');
                    })}>
                    <KeyRound size={14} aria-hidden='true' />{tr('Увімкнути (окремі дані)', 'Aanzetten (eigen gegevens)')}
                  </button>
                  <button type='button' className='ag-knop' disabled={!!bezig} data-diagnose-actie='zet_ai_dienst_gedeeld'
                    onClick={() => void voerActieUit('dienst-gedeeld', async () => {
                      await api.post('/api/owner/connector-v2/activeer-tech', { ...sessionBody(), agent: slug, actie: 'dienst-gedeeld' });
                      return tr('Службу «Підключення ШІ» увімкнено у технічному просторі (спільно з особистим).', 'Dienst «AI-koppelingen» aangezet in de technische ruimte (gedeeld met persoonlijk).');
                    })}>
                    {tr('Увімкнути (спільно)', 'Aanzetten (gedeeld)')}
                  </button>
                </>
              )}
            </div>
          </li>
        ) : null}

        {/* 4. Ondertekend AI-beleid (keten.json — direct ter plaatse tekenen met Passkey zonder omleiding naar admin/ai) */}
        {diag.eigenaar || beleidBlokkeert || diag.aiPolicyState !== 'niet-ingesteld' ? (
          <li className='ag-diagnose-rij' data-diagnose-laag='beleid' data-diagnose-staat={beleidBlokkeert ? diag.aiPolicyState : 'ok'}>
            <div className='ag-diagnose-info'>
              <div className='ag-diagnose-titel'>
                <b>{tr('4. Підписана політика-стеля «Доступ ШІ»', '4. Ondertekend beleidsplafond «AI-toegang»')}</b>
                {!beleidBlokkeert ? (
                  <span className='ag-badge ag-ok'>
                    <Check size={12} aria-hidden='true' />
                    {diag.aiPolicyState === 'niet-ingesteld' ? tr('Не обмежує', 'Beperkt niet') : tr('Дозволяє', 'Staat toe')}
                  </span>
                ) : (
                  <span className='ag-badge ag-warn'>
                    <AlertTriangle size={12} aria-hidden='true' />
                    {tr(`Приховано інструментів: ${diag.aiPolicyBlockedCount}`, `Verborgen hulpmiddelen: ${diag.aiPolicyBlockedCount}`)}
                  </span>
                )}
              </div>
              <small className='hub-meta'>
                {diag.aiPolicyState === 'ongeldig'
                  ? WEIGER_UITLEG.BELEID_ONGELDIG[taal]
                  : diag.aiPolicyState === 'agent-onbekend'
                    ? WEIGER_UITLEG.BELEID_AGENT_ONBEKEND[taal]
                    : diag.aiPolicyState === 'agent-uit'
                      ? WEIGER_UITLEG.BELEID_AGENT_UIT[taal]
                      : diag.aiPolicyState === 'verlopen'
                        ? WEIGER_UITLEG.BELEID_VERLOPEN[taal]
                        : beleidBlokkeert
                          ? WEIGER_UITLEG.BELEID_UIT[taal]
                          : tr('Підписана політика власника не блокує вибрані інструменти цього агента.', 'Het ondertekende beleid van de eigenaar blokkeert de gekozen hulpmiddelen van deze agent niet.')}
              </small>
            </div>
            <div className='ag-diagnose-acties'>
              {diag.eigenaar && beleidBlokkeert && diag.aiPolicyState !== 'ongeldig' ? (
                <button
                  type='button'
                  className='ag-knop ag-knop-primary'
                  disabled={!!bezig}
                  data-diagnose-actie='onderteken_ai_beleid'
                  onClick={() => void voerActieUit('beleid-teken', async () => {
                    const uit = await ondertekenAgentBeleidInPlaats({
                      slug,
                      naam,
                      sleutels: doelSleutels,
                      lang: taal,
                    });
                    if (diag.pendingExpansion.wacht) {
                      await api.post('/api/owner/connector-v2/toepassen', { ...sessionBody(), agent: slug });
                    }
                    if (wilBeheer && !diag.effectiveTechnicalAccess && diag.aiServiceState !== 'bevroren') {
                      await api.post('/api/owner/connector-v2/activeer-tech', {
                        ...sessionBody(),
                        agent: slug,
                        actie: 'alles-aan',
                        verbindingId: doelGrantId,
                        termijn: 'tot-technisch-einde',
                      });
                    }
                    return tr(
                      `Політику «Доступ ШІ» підписано Passkey${uit.getekend ? ` (версія ${uit.seq})` : ''} — інструменти ${naam} розблоковано прямо тут.`,
                      `Beleid «AI-toegang» met Passkey getekend${uit.getekend ? ` (versie ${uit.seq})` : ''} — hulpmiddelen van ${naam} direct hier vrijgegeven.`,
                    );
                  })}
                >
                  <Fingerprint size={14} aria-hidden='true' />
                  {diag.aiPolicyState === 'agent-onbekend'
                    ? tr(`Додати ${naam} у Доступ ШІ та підписати Passkey`, `${naam} toevoegen aan AI-toegang en met Passkey ondertekenen`)
                    : diag.aiPolicyState === 'verlopen'
                      ? tr(`Подовжити ${naam} у Доступ ШІ та підписати Passkey`, `${naam} verlengen in AI-toegang en met Passkey ondertekenen`)
                      : tr(`Увімкнути ${naam} у Доступ ШІ та підписати Passkey`, `${naam} aanzetten in AI-toegang en met Passkey ondertekenen`)}
                </button>
              ) : null}
              <a className={`ag-knop${beleidBlokkeert && (!diag.eigenaar || diag.aiPolicyState === 'ongeldig') ? ' ag-knop-primary' : ''}`} href={adminAiHref} data-diagnose-actie='open_ai_beleid'>
                {tr('Таблиця політики (admin)', 'Beleidstabel (admin)')}
                <ExternalLink size={13} aria-hidden='true' />
              </a>
            </div>
          </li>
        ) : null}

        {/* 5. Wachtende uitbreiding van rechten in voorkeur */}
        {diag.pendingExpansion.wacht ? (
          <li className='ag-diagnose-rij' data-diagnose-laag='voorkeur' data-diagnose-staat='wacht'>
            <div className='ag-diagnose-info'>
              <div className='ag-diagnose-titel'>
                <b>{tr('Чернетка нових дозволів', 'Wachtende nieuwe rechten')}</b>
                <span className='ag-badge ag-warn'>+{diag.pendingExpansion.toegevoegdAantal}</span>
              </div>
              <small className='hub-meta'>{WEIGER_UITLEG.VOORKEUR_WACHT_TOEPASSEN[taal]}</small>
            </div>
            <div className='ag-diagnose-acties'>
              <button type='button' className='ag-knop ag-knop-primary' disabled={!!bezig} data-diagnose-actie='pas_voorkeur_toe'
                onClick={() => void voerActieUit('voorkeur-toe', async () => {
                  const r = await api.post('/api/owner/connector-v2/toepassen', { ...sessionBody(), agent: slug });
                  return tr(
                    `Збережені дозволи застосовано до активного підключення (${r.data?.bijgewerkt ?? 1}) без розриву сесії.`,
                    `Opgeslagen rechten toegepast op de actieve koppeling (${r.data?.bijgewerkt ?? 1}) zonder verbreken.`,
                  );
                })}>
                <Zap size={14} aria-hidden='true' />{tr('Застосувати зараз', 'Nu toepassen')}
              </button>
            </div>
          </li>
        ) : null}

        {/* 6. Aanvullende filters: GitHub / site-schakelaars / hulpmiddelmodi */}
        {diag.githubBlockedCount > 0 ? (
          <li className='ag-diagnose-rij' data-diagnose-laag='github' data-diagnose-staat='uit'>
            <div className='ag-diagnose-info'>
              <div className='ag-diagnose-titel'>
                <b>GitHub</b>
                <span className='ag-badge ag-warn'>{tr(`Приховано: ${diag.githubBlockedCount}`, `Verborgen: ${diag.githubBlockedCount}`)}</span>
              </div>
              <small className='hub-meta'>{WEIGER_UITLEG.GITHUB_NIET_GEKOPPELD[taal]}</small>
            </div>
            <div className='ag-diagnose-acties'>
              <a className='ag-knop' href={githubHref} data-diagnose-actie='koppel_github'>
                {tr('Підключити GitHub', 'GitHub koppelen')} <ExternalLink size={13} aria-hidden='true' />
              </a>
            </div>
          </li>
        ) : null}

        {diag.siteSwitchBlockedCount > 0 || diag.toolModeBlockedCount > 0 ? (
          <li className='ag-diagnose-rij' data-diagnose-laag='schakelaar' data-diagnose-staat='uit'>
            <div className='ag-diagnose-info'>
              <div className='ag-diagnose-titel'>
                <b>{tr('Перемикачі доступів і режими інструментів', 'Toegangsschakelaars en hulpmiddelmodi')}</b>
                <span className='ag-badge ag-warn'>{tr(`Приховано: ${diag.siteSwitchBlockedCount + diag.toolModeBlockedCount}`, `Verborgen: ${diag.siteSwitchBlockedCount + diag.toolModeBlockedCount}`)}</span>
              </div>
              <small className='hub-meta'>
                {diag.siteSwitchBlockedCount > 0 ? WEIGER_UITLEG.SITE_SCHAKELAAR_UIT[taal] : WEIGER_UITLEG.HULPMIDDEL_MODUS_UIT[taal]}
              </small>
            </div>
            <div className='ag-diagnose-acties'>
              <a className='ag-knop' href='#toegang' data-diagnose-actie='open_ai_schakelaars'>{tr('Відкрити «Доступи»', 'Open «Toegang»')}</a>
            </div>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

export default function AgentPagina({ tr, slug, terug }: { tr: Tr; slug: AgentSlug; terug: () => void }) {
  // De open rij is PLAATSELIJK: het adres (#agent/<slug>) wijst de agent aan, niet een geopende rij — anders zou het openen van
  // een tokenrij de slug uit de hash duwen en de pagina kwijtraken.
  const [item, setItem] = useState('');
  const kies = (id: string) => setItem(id);
  const uk = tr('uk', 'nl') === 'uk';
  const info = v2Agent(slug);
  const adres = agentUrl(slug);
  const [data, setData] = useState<Data | null>(null);
  const [fout, setFout] = useState<unknown>(null);
  const [versie, setVersie] = useState(0);
  const tok = useDeurTokens();
  const acties = useActies(tr);
  const tech = useTech();
  const ruimtes = useRuimtes();

  const laad = useCallback(async () => {
    try { setData((await api.post('/api/owner/connector-v2/overzicht', sessionBody())).data as Data); setFout(null); }
    catch (e) { setFout(e); }
  }, []);
  useEffect(() => { void laad(); }, [laad]);
  // Wanneer het technische startvenster of de ruimtewissel sluit/verandert, direct de serverdiagnose herladen zonder paginaherladen.
  useEffect(() => {
    if (tech.geladen || ruimtes.geladen) void laad();
  }, [tech.activatie?.id, tech.activatie?.eind, ruimtes.status?.actief, ruimtes.status?.pauze, ruimtes.status?.sessie?.eindTijd, laad]); // eslint-disable-line react-hooks/exhaustive-deps
  const naWijziging = useCallback(async () => { await Promise.all([laad(), tok.laad()]); setVersie((v) => v + 1); }, [laad, tok.laad]); // eslint-disable-line react-hooks/exhaustive-deps

  const stand = useMemo(() => (data?.agenten ?? []).find((a) => a.slug === slug) ?? null, [data, slug]);
  const diag = stand?.diagnose ?? null;
  // De WARE stand (shared/connector-v2/stand.ts): v2 + oud /mcp + serverdeur. `null` zolang de server niet antwoordde (geen
  // «не підключено» beweren wat we niet weten).
  const ware = stand ? standVanAgent(stand) : null;
  const rijen = useMemo(() => (stand ? rijenVan(stand) : []), [stand]);
  const poort = data?.poort ?? null;
  // MCP-ACCESS-001: gebruik de werkelijke effectieve technische toegang van DEZE agent (inclusief per-verbinding delegatie en beleid),
  // met terugval op de algemene poort zolang diagnose nog niet aanwezig is.
  const ruimteNu = diag ? (diag.effectiveTechnicalAccess ? 'technisch' : 'prive') : (poort?.ruimte ?? 'prive');
  // Toegestane kanten (actieve koppeling, anders de onthouden keuze) en welke daarvan NU bestaan.
  const keuze = stand?.actief ?? stand?.voorkeur ?? null;
  const kanten: Kant[] = keuze?.kanten ?? ['gebruiker'];
  const doelKanten: Kant[] = useMemo(
    () => ([...new Set([...(stand?.actief?.kanten ?? []), ...(stand?.voorkeur?.kanten ?? []), ...kanten])].sort() as Kant[]),
    [stand, kanten],
  );
  const doelSleutels: string[] = useMemo(() => {
    const samengevoegd = [...new Set([...(stand?.actief?.sleutels ?? []), ...(stand?.voorkeur?.sleutels ?? [])])];
    const basis = samengevoegd.some((s) => s !== 'v2_whoami:gebruiker') ? samengevoegd : STANDAARD();
    return schoon(basis, doelKanten.length ? doelKanten : ['gebruiker']);
  }, [stand, doelKanten]);
  const levend = levendeKanten(kanten, ruimteNu);
  const hulpmiddelenNu = diag ? diag.effectiveVisibleToolsCount : (keuze ? zichtbareSleutels(keuze.sleutels, kanten, ruimteNu).length : 0);
  // Tokens van DEZE agent: de naam van een token is de klant waarvoor het is uitgegeven (AiVerbinden stuurt `klant` mee).
  const nu = Date.now();
  // Dezelfde naamregel als de markering in het tabblad en de logo's (shared/markering-agenten.ts), zodat «ChatGPT», «gpt» en
  // «Claude Code» bij de juiste agent terechtkomen. Een token met een vrije naam («ноутбук Олени») hoort bij geen enkele agent
  // en blijft op het algemene tabblad «Токени» staan.
  const eigenTokens = useMemo(() => inRuimte(tok.data?.tokens, 'prive').filter((t) => agentSlugUitNaam(t.name) === slug), [tok.data, slug]);
  const actieveTokens = eigenTokens.filter((t) => !t.revokedAt && (isoMs(t.expiresAt) ?? 0) > nu).length;
  const journaal = useJournaal(useMemo(() => ({ soort: '', onderwerp: '', limit: 80 }), []), true, versie);
  const eigenEvents = useMemo(() => (journaal.items ?? []).filter((e) => agentVanItem(e) === slug), [journaal.items, slug]);

  const stempel = ware ? tr(ware.uk, ware.nl) : tr('стан невідомий', 'stand onbekend');
  const stempelKlas = !ware ? 'is-onbekend' : ware.code === 'wacht' ? 'is-wacht' : ware.alleenOud ? 'is-oud' : ware.verbonden ? 'is-aan' : 'is-uit';

  // Een grant van het oude /mcp intrekken gaat via de bestaande route van de connector; de serverdeur trekt alleen het technische
  // tabblad in (die lijst is sitebeheer), dus daar wijzen we naartoe.
  const intrekOud = (r: Rij) => acties.voerUit(r.sleutel, async () => {
    await api.post(`/api/owner/mcp-connector/grants/${r.id}/revoke`, sessionBody());
    await naWijziging();
    return tr(`Старе підключення «${r.naam}» відкликано. Підключіть ${info.naam} знову через власну адресу вище.`, `Oude koppeling «${r.naam}» ingetrokken. Koppel ${info.naam} opnieuw via het eigen adres hierboven.`);
  }, ['Не вдалося відкликати', 'Intrekken mislukt']);

  return (
    <div className='ag-tab ag-agent' data-agent-pagina={slug} data-agent-stand={ware?.code ?? 'onbekend'}>
      <div className='ag-agent-kop'>
        <button type='button' className='ag-link' onClick={terug} data-agent-terug='1'><ArrowLeft size={14} aria-hidden='true' />{tr('Усі ШІ', 'Alle AI')}</button>
        <AgentLogo agent={slug} naam={info.naam} size={34} />
        <div>
          <h2>{info.naam}</h2>
          <small className={`v2b-stand ${stempelKlas}`} data-agent-stempel={ware?.code ?? 'onbekend'}><i aria-hidden='true' />{stempel}</small>
        </div>
      </div>
      {fout ? <p className='ag-melding ag-melding-fout' role='alert'>{foutTekst(fout, tr, ['Не вдалося завантажити дані агента', 'Gegevens van de agent laden mislukt'])}</p> : null}
      {diag && diag.connectionGranted.verbonden && diag.denialCode ? (
        <div className='ag-melding ag-diagnose-snel' role='status' data-agent-snel-diagnose={diag.denialCode}>
          <AlertTriangle size={16} aria-hidden='true' />
          <span>
            <b>{tr(`Зараз ${info.naam} бачить ${diag.effectiveVisibleToolsCount} із ${diag.connectionGranted.totaal} наданих інструментів.`, `Nu ziet ${info.naam} ${diag.effectiveVisibleToolsCount} van ${diag.connectionGranted.totaal} toegekende hulpmiddelen.`)}</b>{' '}
            {WEIGER_UITLEG[diag.denialCode][uk ? 'uk' : 'nl']}
          </span>
          <a className='ag-knop ag-knop-primary' href={`#ag-agent-gereedheid-${slug}`}
            onClick={(e) => { e.preventDefault(); document.getElementById(`ag-agent-gereedheid-${slug}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>
            {tr('Відкрити дії нижче', 'Acties hieronder openen')}
          </a>
        </div>
      ) : null}

      {/* 1: підключити — de grote knop en de stappen voor juist deze client, en de ware stand. */}
      <section className='ag-kaart ag-agent-verbinden' data-agent-sectie='verbinding' aria-labelledby={`ag-agent-verbinding-${slug}`}>
        <div className='ag-kaart-kop'><h3 id={`ag-agent-verbinding-${slug}`}><Plug size={16} aria-hidden='true' /> {tr(`Підключити ${info.naam}`, `${info.naam} koppelen`)}</h3>
          <small className='hub-meta' data-agent-hulpmiddelen={hulpmiddelenNu}>{data ? tr(`інструментів зараз видно: ${hulpmiddelenNu}`, `hulpmiddelen nu zichtbaar: ${hulpmiddelenNu}`) : ''}</small></div>
        <AgentVerbinden tr={tr} slug={slug} />

        <div className='ag-agent-verbindingen' data-agent-verbindingen={rijen.length}>
          <h4>{tr('Що зараз підключено', 'Wat er nu gekoppeld is')}</h4>
          <Melding uitkomst={acties.uitkomst} tr={tr} onSluit={() => acties.setUitkomst(null)} />
          {!data && !fout ? <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p>
            : rijen.length ? (
              <ul className='v2-koppelingen ag-agent-koppelingen'>
                {rijen.map((r) => {
                  const soort = SOORT_TEKST[r.soort];
                  return (
                    <li key={r.sleutel} data-agent-verbinding={r.soort} className={soort.oud ? 'is-oud' : ''}>
                      <span><b>{r.naam}</b> <small className='hub-meta'>{uk ? soort.uk : soort.nl}</small></span>
                      <span>{r.kanten.map((x) => <span key={x} className={`v2-kant-teller kant-${x}`}>{x === 'beheer' ? <Wrench size={12} /> : <UserRound size={12} />}{KANT_TEKST[x][uk ? 'uk' : 'nl']}</span>)}</span>
                      <span>{r.soort === 'v2' ? tr(`${r.sleutels} дозволів`, `${r.sleutels} rechten`) : tr('права як на старій адресі', 'rechten van het oude adres')}</span>
                      <small>{tr('остання дія', 'laatst gebruikt')}: {wanneer(r.laatst, uk)}{r.tot ? ` · ${tr('діє до', 'geldig tot')} ${wanneer(r.tot, uk)}` : ''}</small>
                      {r.soort === 'erfenis' ? <GevaarKnop tr={tr} sleutel={r.sleutel} label={tr('Відкликати старе', 'Oude intrekken')} ja={tr('Так, відкликати', 'Ja, intrekken')} acties={acties} icoon={<Trash2 />} klein
                        vraag={tr(`«${r.naam}» одразу втратить доступ через стару адресу. Потім підключіть ${info.naam} через кнопку вище.`, `«${r.naam}» verliest meteen de toegang via het oude adres. Koppel ${info.naam} daarna via de knop hierboven.`)} onJa={() => void intrekOud(r)} /> : null}
                      {r.soort === 'deur' ? <small className='hub-meta'><a href='#technisch' className='ag-link'>{tr('відкликати на вкладці «Технічне»', 'intrekken op het tabblad «Technisch»')}</a></small> : null}
                    </li>
                  );
                })}
              </ul>
            ) : <p className='ag-leeg' data-agent-leeg='1'>{tr(`${info.naam} ще не підключено. Натисніть кнопку вище й пройдіть кроки.`, `${info.naam} is nog niet gekoppeld. Klik op de knop hierboven en volg de stappen.`)}</p>}
          {ware?.alleenOud ? <p className='ag-verbind-let' role='note' data-agent-oud-pad='1'>{tr(`${info.naam} працює через стару дорогу. Усе ще діє, але нові дозволи, живі права й журнал саме цього ШІ є лише на власній адресі. Підключіть ${info.naam} знову через кнопку вище й відкличте старе.`, `${info.naam} werkt via een oude weg. Het werkt nog, maar nieuwe rechten, levende rechten en het logboek van juist deze AI bestaan alleen op het eigen adres. Koppel ${info.naam} opnieuw via de knop hierboven en trek het oude in.`)}</p> : null}
          {stand?.deur === null && data?.account.eigenaar ? <p className='hub-meta' data-agent-deur='onbekend'>{tr('Двері сервера зараз не відповідають або вимкнені — підключення через них (якщо є) тут не видно.', 'De serverdeur antwoordt nu niet of staat uit — koppelingen daarlangs (als die er zijn) zijn hier niet te zien.')}</p> : null}
        </div>
        <p className='hub-meta' data-agent-oude-adressen='1'>{tr(`Адреса ${info.naam}: `, `Adres van ${info.naam}: `)}<code data-agent-adres={slug}>{adres}</code>{tr(` — тільки для ${info.naam}; токен, виданий для неї, більше ніде не працює. Старі адреси (${OUD_GEDEELD_URL}, ${oudAgentUrl(slug)}) відповідають перенаправленням 308 сюди.`,
          ` — alleen voor ${info.naam}; een token voor dit adres werkt nergens anders. De oude adressen (${OUD_GEDEELD_URL}, ${oudAgentUrl(slug)}) antwoorden met een 308 naar dit adres.`)}</p>
      </section>

      {/* 1b (21.10.2026): wat DEZE AI voorstelde en op uw «Підтвердити» wacht (mail verzenden, delen, foto's …). */}
      <BevestigingenPaneel tr={tr} agent={slug} />

      {/* 2: дозволи — dezelfde kiezer als in het toestemmingsvenster, met herverbinden en intrekken. */}
      <section className='ag-kaart' data-agent-sectie='rechten' aria-labelledby={`ag-agent-rechten-${slug}`}>
        <div className='ag-kaart-kop'><h3 id={`ag-agent-rechten-${slug}`}><Link2 size={16} aria-hidden='true' /> {tr('Дозволи', 'Rechten')}</h3></div>
        {data && stand ? <AgentInstellingen tr={tr} uk={uk} a={stand} eigenaar={!!data.account.eigenaar} naWijziging={naWijziging} />
          : <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p>}
      </section>

      {/* 3: простір — welke kanten zijn toegestaan en welke NU bestaan (levende poort van de server). */}
      <section className='ag-kaart' data-agent-sectie='ruimte' aria-labelledby={`ag-agent-ruimte-${slug}`}>
        <div className='ag-kaart-kop'><h3 id={`ag-agent-ruimte-${slug}`}><ShieldCheck size={16} aria-hidden='true' /> {tr('Простір', 'Ruimte')}</h3></div>
        <ul className='ag-agent-ruimtes' data-agent-kanten={kanten.join(',')} data-agent-levend={levend.join(',')} data-agent-poort={poort ? `${poort.ruimte}:${poort.stand}` : 'onbekend'}>
          {(['prive', 'technisch'] as const).map((r) => {
            const kant: Kant = r === 'prive' ? 'gebruiker' : 'beheer';
            const toegestaan = kanten.includes(kant);
            const nuAan = levend.includes(kant);
            return (
              <li key={r} data-ruimte={r} data-ruimte-toegestaan={toegestaan ? '1' : '0'} data-ruimte-nu={nuAan ? '1' : '0'} className={toegestaan ? (nuAan ? 'is-aan' : 'is-slapend') : 'is-uit'}>
                <b>{uk ? RUIMTE_NAAM[r].uk : RUIMTE_NAAM[r].nl} <small className='v2b-stand'>{!toegestaan ? tr('не дозволено', 'niet toegestaan') : nuAan ? tr('дозволено · діє зараз', 'toegestaan · nu actief') : tr('дозволено · зараз не діє', 'toegestaan · nu niet actief')}</small></b>
                <small>{uk ? RUIMTE_UITLEG[r].uk : RUIMTE_UITLEG[r].nl}</small>
              </li>
            );
          })}
        </ul>
        <p className='hub-meta'>{tr(`Зараз для ${info.naam} дозволено: ${kanten.map((k) => KANT_TEKST[k].uk).join(', ')}; діє: ${levend.map((k) => KANT_TEKST[k].uk).join(', ')}. Технічні інструменти існують лише поки активний ваш технічний профіль і дія «Підключення ШІ» увімкнена в технічному просторі — незалежно від того, що відмічено.`,
          `Nu toegestaan voor ${info.naam}: ${kanten.map((k) => KANT_TEKST[k].nl).join(', ')}; actief: ${levend.map((k) => KANT_TEKST[k].nl).join(', ')}. Technische hulpmiddelen bestaan alleen zolang uw technisch profiel actief is en «AI-koppelingen» in de technische ruimte aan staat — wat er ook is aangevinkt.`)}</p>
        {(diag?.denialCode ?? poort?.code) ? (
          <p className='hub-meta' data-agent-poort-code={diag?.denialCode ?? poort?.code ?? undefined}>
            {tr(`Причина обмеження зараз: ${diag?.denialCode ?? poort?.code}.`, `Reden van huidige beperking: ${diag?.denialCode ?? poort?.code}.`)}{' '}
            {diag?.denialCode ? WEIGER_UITLEG[diag.denialCode][uk ? 'uk' : 'nl'] : ''}
          </p>
        ) : null}
        {diag ? (
          <AgentToegangGereedheid tr={tr} uk={uk} slug={slug} naam={info.naam} diag={diag} kanten={kanten} doelSleutels={doelSleutels} naWijziging={naWijziging} />
        ) : null}
      </section>

      {/* 4: спосіб зв'язку (прямий токен) і токени саме цього агента — ingeklapt: waar OAuth bestaat is dit de oude weg. */}
      <section className='ag-kaart' data-agent-sectie='verbinding-soort' aria-labelledby={`ag-agent-tokens-${slug}`}>
        <details open={actieveTokens > 0}>
          <summary><KeyRound size={15} aria-hidden='true' /> <span id={`ag-agent-tokens-${slug}`}>{tr('Прямий токен (для клієнтів без входу через браузер)', 'Direct token (voor clients zonder aanmelden via de browser)')}</span>
            <small className='hub-meta' data-agent-tokens={actieveTokens}>{tr(`активних токенів: ${actieveTokens}`, `actieve tokens: ${actieveTokens}`)}</small></summary>
          <p className='hub-meta'>{tr('Лише якщо ваш клієнт не вміє входити через OAuth і просить заголовок Authorization: Bearer. Для Claude, ChatGPT, Cursor і VS Code це не потрібно — використовуйте кнопку вгорі.', 'Alleen als uw client niet via OAuth kan aanmelden en een kop Authorization: Bearer vraagt. Voor Claude, ChatGPT, Cursor en VS Code is dit niet nodig — gebruik de knop bovenaan.')}</p>
          <div data-agent-sectie='tokens'>
            <TabTokens tr={tr} data={tok.data ? { ...tok.data, tokens: eigenTokens } : null} naActie={naWijziging} item={item} kies={kies} vastKlant={info.klant} />
          </div>
        </details>
      </section>

      {/* 5: колір агента — та сама секція, що в «Розширенні браузера» (один список, без копії). */}
      <section className='ag-kaart' data-agent-sectie='kleur'>
        <details>
          <summary><Palette size={15} aria-hidden='true' /> {tr(`Колір агента (${info.naam} та інші)`, `Kleur per agent (${info.naam} en de andere)`)}</summary>
          <AgentKleuren tr={tr} />
        </details>
      </section>

      {/* 6: журнал саме цього агента. */}
      <section className='ag-kaart' data-agent-sectie='journaal' aria-labelledby={`ag-agent-journaal-${slug}`}>
        <div className='ag-kaart-kop'><h3 id={`ag-agent-journaal-${slug}`}><Activity size={16} aria-hidden='true' /> {tr(`Журнал: ${info.naam}`, `Logboek: ${info.naam}`)}</h3>
          <small className='hub-meta'>{tr('Події інших ШІ — у спільному журналі.', 'Gebeurtenissen van andere AI staan in het gezamenlijke logboek.')}</small></div>
        {journaal.fout ? <p className='ag-melding ag-melding-fout' role='alert'>{foutTekst(journaal.fout, tr, ['Не вдалося завантажити події', 'Gebeurtenissen laden mislukt'])}</p> : null}
        {journaal.items === null ? <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p>
          : eigenEvents.length ? <JournaalLijst tr={tr} items={eigenEvents.slice(0, 25)} compact />
            : <p className='ag-leeg' data-agent-journaal='leeg'>{tr(`Для ${info.naam} подій ще немає.`, `Voor ${info.naam} zijn er nog geen gebeurtenissen.`)}</p>}
      </section>
      <p className='hub-meta' data-agent-voet='1'><SlidersHorizontal size={13} aria-hidden='true' /> {tr('Пристрої, зовнішні MCP-сервери, розширення браузера й повний журнал — спільні для всіх ШІ й лишаються окремими вкладками.', 'Apparaten, externe MCP-servers, de browserextensie en het volledige logboek zijn voor alle AI samen en blijven eigen tabbladen.')}</p>
    </div>
  );
}
