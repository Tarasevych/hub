// Dubbele meldingen (meerdere tabbladen, wisselende staat) verschijnen één keer; meldingen met een knop nooit onderdrukt.
import { collapseKeyOf, DEFAULT_NOTICE_POLICY, emitCanonicalNotice, ingestNotice, NOTICE_KINDS, NOTICE_LIMITS, normalizeLink, normalizeNoticePolicy, pruneNotices, toastLifetimeMs, type Incoming, type StoredNotice } from '../../src/canonical-notifications';
import { noticeExplain, reasonText, siteActionText } from '../../src/notification-style';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('notice-dedupe');
  const g = globalThis as any;
  const old = { window: g.window, localStorage: g.localStorage, CustomEvent: g.CustomEvent };
  const store = new Map<string, string>(); let emitted = 0;
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  g.CustomEvent = class { constructor(public type: string, public init: unknown) {} };
  g.window = { dispatchEvent: () => { emitted += 1; return true; } };
  try {
    emitCanonicalNotice({ text: 'A', source: 'mcp', kind: 'success' });
    emitCanonicalNotice({ text: 'A', source: 'mcp', kind: 'success' });
    check('dezelfde melding twee keer kort na elkaar (bv. twee tabbladen): één keer getoond', emitted === 1);
    emitCanonicalNotice({ text: 'B', source: 'mcp', kind: 'success' });
    emitCanonicalNotice({ text: 'A', source: 'mail', kind: 'success' });
    emitCanonicalNotice({ text: 'A', source: 'mcp', kind: 'error' });
    check('andere tekst, bron of soort telt wel', emitted === 4);
    emitCanonicalNotice({ text: 'C', action: { label: 'x', onAction: () => {} } });
    emitCanonicalNotice({ text: 'C', action: { label: 'x', onAction: () => {} } });
    check('meldingen met een knop worden nooit onderdrukt', emitted === 6);
    store.set('tsv:notice-recent-v1', JSON.stringify({ 'mcp|success|D': Date.now() - 120_000 }));
    emitCanonicalNotice({ text: 'D', source: 'mcp', kind: 'success' });
    check('na het venster (90 s) mag dezelfde melding opnieuw', emitted === 7);
    store.set('tsv:notice-recent-v1', JSON.stringify({ 'mcp|success|E': Date.now() - 120_000 }));
    emitCanonicalNotice({ text: 'E', source: 'mcp', kind: 'success', dedupeSeconds: 1800 });
    check('een langer venster (stapmeldingen van de installatiehulp: 30 min) onderdrukt herhalingen', emitted === 7);
    g.localStorage = { getItem: () => { throw new Error('geen opslag'); }, setItem: () => { throw new Error('geen opslag'); } };
    emitCanonicalNotice({ text: 'F' }); emitCanonicalNotice({ text: 'F' });
    check('zonder bruikbare opslag werkt het nog steeds (geen onderdrukking, geen fout)', emitted === 9);
  } finally { g.window = old.window; g.localStorage = old.localStorage; g.CustomEvent = old.CustomEvent; }
  modelChecks(check);
  return einde();
}

/** Het meldingenarchief: samenvoegen, oplossen, opruimen, looptijd van de pop-up, voorkeuren en de tekst van een melding. */
function modelChecks(check: (naam: string, ok: boolean, info?: string) => void) {
  const DAY = 86_400_000;
  const now = Date.now();
  const base = (over: Partial<Incoming>): Incoming => ({ id: 'n:1', origin: 'local', kind: 'error', source: 'mail:google', text: 'Bericht niet verzonden 12', group: collapseKeyOf('mail:google', 'error', 'Bericht niet verzonden 12'), topic: 'onderwerp', state: 'open', now, collapseMs: NOTICE_LIMITS.collapseMs, ...over });
  let r = ingestNotice([], base({}));
  r = ingestNotice(r.rows, base({ id: 'n:2', text: 'Bericht niet verzonden 13', now: now + 1000 }));
  check('zelfde melding (alleen een cijfer anders) binnen het venster: één regel met teller 2, geen nieuwe pop-up', r.change === 'merged' && r.rows.length === 1 && r.rows[0].count === 2 && r.rows[0].read === false);
  r = ingestNotice(r.rows, base({ id: 'n:3', now: now + NOTICE_LIMITS.collapseMs + 60_000 }));
  check('na het venster van 10 minuten: een nieuwe regel', r.change === 'new' && r.rows.length === 2);

  const act = (over: Partial<Incoming>): Incoming => ({ id: 'a:e1', origin: 'activity', kind: 'warning', source: 'agent:windows', text: 'Opdracht: wacht', group: 'T|waiting', topic: 'T', status: 'pending_approval', ids: ['e1'], state: 'open', now, collapseMs: NOTICE_LIMITS.collapseMs, ...over });
  const first = ingestNotice([], act({}));
  const same = ingestNotice(first.rows, act({ now: now + 5000 }));
  check('activiteit met dezelfde stand: geen wijziging, dus geen herhaling', same.change === 'same' && same.rows === first.rows);
  const done = ingestNotice(first.rows, act({ id: 'a:e1', status: 'succeeded', kind: 'success', group: 'T|done', state: 'resolved', now: now + 9000 }));
  check('stand verandert naar gelukt: bijgewerkt, en de melding is opgelost', done.change === 'updated' && done.entry.state === 'resolved' && done.entry.status === 'succeeded');

  const failed = ingestNotice([], act({ id: 'a:f1', status: 'failed', kind: 'error', group: 'T2|failed', topic: 'T2', ids: ['f1'], state: 'open' }));
  const later = ingestNotice(failed.rows, act({ id: 'a:s1', status: 'succeeded', kind: 'success', group: 'T2|done', topic: 'T2', ids: ['s1'], state: 'resolved' }));
  check('later gelukt (zelfde onderwerp) lost de eerdere mislukking op: die komt niet terug als pop-up', later.rows.find((x) => x.id === 'a:f1')?.state === 'resolved');

  const mk = (over: Partial<StoredNotice>): StoredNotice => ({ id: 'x', origin: 'local', kind: 'info', source: '', text: 't', group: 'g', topic: 'g', createdAt: now, updatedAt: now, count: 1, read: false, state: 'open', ...over });
  const pruned = pruneNotices([
    mk({ id: 'oud-open', updatedAt: now - 15 * DAY }),
    mk({ id: 'oud-opgelost', state: 'resolved', updatedAt: now - 31 * DAY }),
    mk({ id: 'archief-oud', state: 'archived', updatedAt: now - 61 * DAY }),
    mk({ id: 'nieuw', updatedAt: now }),
  ], now);
  const byId = (id: string) => pruned.find((x) => x.id === id);
  check('houdbaarheid: open na 14 dagen en opgelost na 30 dagen gaan naar het archief; archief ouder dan 60 dagen gaat weg', byId('oud-open')?.state === 'archived' && byId('oud-open')?.auto === true && byId('oud-opgelost')?.state === 'archived' && !byId('archief-oud') && byId('nieuw')?.state === 'open');
  const many = pruneNotices(Array.from({ length: 260 }, (_, i) => mk({ id: `m${i}`, updatedAt: now - i })), now);
  check('nooit meer dan 200 regels in het archief', many.length === NOTICE_LIMITS.max);

  const pol = normalizeNoticePolicy(null);
  check('standaard: fouten en waarschuwingen met geluid, successen en info zonder geluid; niemand blijft staan', pol.error.sound && pol.warning.sound && !pol.success.sound && !pol.info.sound && NOTICE_KINDS.every((k) => !pol[k].sticky && pol[k].toast));
  check('looptijd hangt af van soort en inhoud: fout langer dan succes, lange tekst langer dan korte', (toastLifetimeMs(pol, 'error', 'kort') ?? 0) > (toastLifetimeMs(pol, 'success', 'kort') ?? 0) && (toastLifetimeMs(pol, 'info', 'x'.repeat(200)) ?? 0) > (toastLifetimeMs(pol, 'info', 'kort') ?? 0));
  check('blijft staan (sticky) geeft geen tijdslimiet', toastLifetimeMs(normalizeNoticePolicy({ error: { sticky: true } }), 'error', 'x') === null);
  check('ongeldige voorkeuren worden hersteld: seconden binnen 3 en 60', normalizeNoticePolicy({ info: { seconds: 999 } }).info.seconds === 60 && normalizeNoticePolicy({ info: { seconds: -4 } }).info.seconds === 3 && DEFAULT_NOTICE_POLICY.info.seconds === 7);

  const explain = noticeExplain({ group: 'failed', section: 'claude', lang: 'uk', reason: 'AI_NIET_TOEGESTAAN' });
  const explainNl = noticeExplain({ group: 'failed', section: 'claude', lang: 'nl', reason: 'AI_NIET_TOEGESTAAN' });
  check('uitleg bij een fout noemt de oorzaak en wat u nu kunt doen (uk en nl)', explain.includes('AI_NIET_TOEGESTAAN') && explain.includes('Що зробити') && explain.includes('Claude') && explainNl.includes('Wat nu') && explainNl.includes('AI_NIET_TOEGESTAAN'), explain);
  check('site-actie zonder bekende naam krijgt een zin met het gebied, geen ruwe auditnaam', siteActionText('owner.vault.secret.denied', 'uk').includes('секрет') && siteActionText('owner.github.issue_create', 'nl').startsWith('GitHub:'));
  check('een vrije oorzaak blijft zichtbaar, een lange wordt ingekort', reasonText('Tijdelijk niet bereikbaar', 'nl') === 'Tijdelijk niet bereikbaar' && reasonText('x'.repeat(300), 'nl').length <= 160);
  check('links: alleen interne paden en tarasevych.com; vreemde domeinen vallen weg', normalizeLink({ href: '/mail', label: 'a' })?.href === '/mail' && normalizeLink({ href: 'https://evil.example/x', label: 'a' }) === undefined);
}
