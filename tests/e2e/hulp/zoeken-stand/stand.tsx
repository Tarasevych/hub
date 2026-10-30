// Ontwikkelstand voor tests/e2e/mail-zoeken-v2.e2e.ts: de zoekpanelen van mail.* in isolatie (geen server, geen Google).
// ?modus=oud-filters | oud-meer → de ECHTE oude panelen (MailZoekFilters / MailGeavanceerdZoeken) voor voor-schermafdrukken.
// ?modus=nieuw → MailZoekenV2 precies zoals de werkruimte hem met vlag toont. ?weergave=<editor> opent een editor direct.
// ?grenzen=bevestigd|laden|fout|onbekend bootst de staat van de archiefgrenzen na.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { defaultMailSearchCriteria, type MailSearchCriteria, type MailSearchFacets } from '../../../../src/mail-zoek';
import MailAdvancedSearch from '../../../../src/MailGeavanceerdZoeken';
import MailSearchFilters from '../../../../src/MailZoekFilters';
import MailZoekenV2, { type V2Weergave } from '../../../../src/mail-zoeken-v2/MailZoekenV2';
import '../../../../src/ontwerp/tokens.css';
import '../../../../src/index.css';
import '../../../../src/google-mail-werkruimte.css';

const zoek = new URLSearchParams(location.search);
const lang = (zoek.get('lang') === 'nl' ? 'nl' : 'uk') as 'uk' | 'nl';
const modus = zoek.get('modus') || 'nieuw';
const donker = zoek.get('thema') === 'donker';
document.documentElement.lang = lang;
document.documentElement.classList.add(donker ? 'theme-dark' : 'theme-light');
const log = (s: string) => { (window as any).__standLog = [...((window as any).__standLog || []), s]; };
const dag = 86400000, nu = Date.now();
const grenzen = zoek.get('grenzen') || 'bevestigd';
const facets: MailSearchFacets = {
  minDate: nu - 3000 * dag, maxDate: nu, indexedCount: 4120, metadataMissingCount: 0, indexComplete: true, syncComplete: true, truncated: false,
  dateBuckets: [2026, 2025, 2024].flatMap((y) => Array.from({ length: 12 }, (_, i) => ({ year: y, month: i + 1, count: 20 + ((i * 7 + y) % 50), minDate: 0, maxDate: 0, days: [2, 5, 9, 14, 21, 27] }))),
  attachmentTypes: ['pdf', 'jpg', 'png', 'docx', 'xlsx', 'zip', 'ics', 'heic'],
  attachmentTypeCounts: [['pdf', 312], ['jpg', 188], ['png', 96], ['docx', 41], ['xlsx', 37], ['zip', 12], ['ics', 9], ['heic', 4]].map(([type, count]) => ({ type: String(type), count: Number(count) })),
  senders: [
    ['Олена Коваленко', 'olena.kovalenko@example.org', 84], ['Belastingdienst', 'noreply@belastingdienst.example.nl', 41], ['Bol.com', 'klantenservice@bol.example.com', 33],
    ['', 'a.very.long.address.for.testing.wrapping.behaviour@subdomain.example-company.co.uk', 12], ['Mijn bank', 'berichten@bank.example.be', 27], ['Tetiana', 'tetiana@example.com', 9],
  ].map(([name, email, count]) => ({ name: String(name), email: String(email), count: Number(count), lastSeen: nu - 3 * dag })),
  recipients: [['Pavlo', 'pavlo@example.com', 120], ['Team', 'team@example.org', 15]].map(([name, email, count]) => ({ name: String(name), email: String(email), count: Number(count), lastSeen: nu })),
  frequentContacts: [],
  labels: [{ id: 'Label_1', name: 'Рахунки', type: 'user', accountIds: ['a'] }, { id: 'Label_2', name: 'Подорожі 2025 — квитки, бронювання та маршрути', type: 'user', accountIds: ['a'] }, { id: 'Label_3', name: 'Werk', type: 'user', accountIds: ['a'] }],
  subjects: [['Рахунок за жовтень', 6], ['Factuur oktober', 5], ['Бронювання підтверджено', 4], ['Uw pakket is onderweg', 3]].map(([value, count], i) => ({ value: String(value), count: Number(count), lastSeen: nu - i * 9 * dag })),
  providerYears: [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019],
  providerYearsComplete: grenzen === 'bevestigd', providerYearsChecking: grenzen === 'laden', providerRefreshError: grenzen === 'fout',
  providerBoundsErrorCode: grenzen === 'fout' ? 'MAIL_PERIOD_BOUNDS_TIMEOUT' : '',
  providerMinDate: grenzen === 'bevestigd' ? new Date(2019, 2, 14).getTime() : 0, providerMaxDate: grenzen === 'bevestigd' ? nu : 0, providerCheckedAt: grenzen === 'bevestigd' ? nu : 0,
};
const accounts = [{ id: 'a', email: 'pavlo@example.com', displayName: 'Pavlo' }];
const labels = [{ id: 'INBOX', name: 'INBOX', type: 'system' as const }, { id: 'Label_1', name: 'Рахунки', type: 'user' as const }];
const recent = ['factuur oktober', 'from:bol has:attachment', 'рахунок'].map((query, i) => ({ id: `r${i}`, query, criteria: defaultMailSearchCriteria(['a']), searchedAt: nu - i * 1000 }));

function Stand() {
  const voorbeeld = zoek.get('voorbeeld') === '1';
  const [c, setC] = useState<MailSearchCriteria>(() => voorbeeld
    ? { ...defaultMailSearchCriteria(['a']), fromValues: ['olena.kovalenko@example.org'], hasAttachment: true, attachmentTypes: ['pdf'], readStates: ['unread'] }
    : defaultMailSearchCriteria(['a']));
  const [q, setQ] = useState(voorbeeld ? 'рахунок' : '');
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState(zoek.get('opgeslagen') === '1' ? [{ id: 's1', name: 'Рахунки з PDF', query: 'рахунок', criteria: c, savedAt: nu }] : []);
  const [recents, setRecents] = useState(recent);
  return (
    <div className={`canonical-chrome ${donker ? 'theme-dark' : 'theme-light'}`} style={{ minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="mail-top-command-bar" style={{ position: 'fixed' }}><div className="mail-top-search-area"><div className="mail-top-search-shell"><span /><input aria-label="zoekbalk" defaultValue={q} /><button type="button" className="mail-top-search-tune" onClick={() => setOpen((v) => !v)}>⚙</button><span /></div></div></div>
      {modus === 'nieuw' && <MailZoekenV2 lang={lang} open={open} query={q} criteria={c} accounts={accounts} currentAccountId="a" labels={labels} facets={facets} busy={false}
        savedSearches={saved} recentSearches={recents} beginWeergave={(zoek.get('weergave') || 'home') as V2Weergave}
        onClose={() => { log('sluiten'); setOpen(false); }} onRun={(nq, nc) => { log(`zoeken:${JSON.stringify([nq, nc.fromValues, nc.readStates, nc.datePreset, nc.dateFrom, nc.dateTo, nc.attachmentTypes, nc.sizeMode, nc.sizeValue])}`); setQ(nq); setC(nc); }}
        onClearAll={() => log('resetten')} onSave={(nq) => { log(`opslaan:${nq}`); setSaved([{ id: 's2', name: nq || 'Пошук', query: nq, criteria: c, savedAt: nu }]); }}
        onRenameSaved={(id, name) => { log(`hernoem:${id}:${name}`); setSaved((l) => l.map((s) => (s.id === id ? { ...s, name } : s))); }} onRemoveSaved={(id) => { log(`wis:${id}`); setSaved((l) => l.filter((s) => s.id !== id)); }}
        onClearRecent={() => { log('wis-recent'); setRecents([]); }} onLoadFacets={() => log('facetten')} onPeriodOpen={() => log('periode-open')} onPeriodSync={() => log('periode-sync')} />}
      {modus === 'oud-meer' && <MailAdvancedSearch lang={lang} open query={q} criteria={c} accounts={accounts} currentAccountId="a" labels={labels} facets={facets} busy={false} savedSearches={saved} recentSearches={recents}
        onQueryChange={setQ} onClose={() => undefined} onBack={() => undefined} onChange={setC} onApply={(n) => { log('oud-zoeken'); setC(n); }} onClearAll={() => undefined} onSearch={() => log('oud-zoeken')}
        onLoadFacets={() => log('facetten')} onPeriodOpen={() => undefined} onPeriodSync={() => undefined} onSave={() => undefined} onRemoveSaved={() => undefined} />}
      {modus === 'oud-filters' && <MailSearchFilters lang={lang} open summaryOpen={false} criteria={c} labels={labels} senders={[]} facets={facets} currentAccountId="a" allAccountIds={['a']}
        onChange={(n) => { log('oud-zoeken'); setC(n); }} onCriteriaOnly={setC} onClearAll={() => undefined} onClose={() => undefined} onMore={() => undefined} onSummaryEnter={() => undefined}
        onSummaryLeave={() => undefined} onSummaryCollapse={() => undefined} onPeriodOpen={() => undefined} onPeriodSync={() => undefined} />}
    </div>
  );
}
createRoot(document.body.appendChild(document.createElement('div'))).render(<StrictMode><Stand /></StrictMode>);
