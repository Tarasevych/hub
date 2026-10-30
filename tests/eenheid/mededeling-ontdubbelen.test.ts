// Dubbele meldingen (meerdere tabbladen, wisselende staat) verschijnen één keer; meldingen met een knop nooit onderdrukt.
import { emitCanonicalNotice } from '../../src/canoniek-meldingen';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mededeling-ontdubbelen');
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
  return einde();
}
