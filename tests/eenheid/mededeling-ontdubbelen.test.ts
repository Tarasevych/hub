// Dubbele meldingen tussen tabbladen geven één pop-up; herhalingen binnen één tabblad komen door (het centrum telt ze op tot één regel).
// Meldingen met een knop worden nooit onderdrukt. Verder: samenvoegen, oplossen door een latere gelukte stap, en de levensduur van de pop-up.
import { SAMENVOEG_MS, emitCanonicalNotice, losOpEerdere, popupLevensduurMs, samenvoegSleutel, zoekSamenvoeging } from '../../src/canoniek-meldingen';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mededeling-ontdubbelen');
  const g = globalThis as any;
  const old = { window: g.window, localStorage: g.localStorage, sessionStorage: g.sessionStorage, CustomEvent: g.CustomEvent };
  const maakOpslag = (m: Map<string, string>) => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
  const store = new Map<string, string>(); // localStorage: gedeeld door alle tabbladen
  let tabStore = new Map<string, string>(); // sessionStorage: per tabblad
  let emitted = 0;
  g.localStorage = maakOpslag(store);
  g.CustomEvent = class { constructor(public type: string, public init: unknown) {} };
  g.window = { dispatchEvent: () => { emitted += 1; return true; } };
  try {
    g.sessionStorage = maakOpslag(tabStore);
    emitCanonicalNotice({ text: 'A', source: 'mcp', kind: 'success' });
    emitCanonicalNotice({ text: 'A', source: 'mcp', kind: 'success' });
    check('herhaling binnen hetzelfde tabblad komt door (het centrum voegt die samen tot één regel)', emitted === 2);

    tabStore = new Map<string, string>(); g.sessionStorage = maakOpslag(tabStore); // een ander tabblad, zelfde localStorage
    emitCanonicalNotice({ text: 'A', source: 'mcp', kind: 'success' });
    check('zelfde melding in een ANDER tabblad binnen het venster: geen tweede pop-up', emitted === 2);
    emitCanonicalNotice({ text: 'B', source: 'mcp', kind: 'success' });
    emitCanonicalNotice({ text: 'A', source: 'mail', kind: 'success' });
    emitCanonicalNotice({ text: 'A', source: 'mcp', kind: 'error' });
    check('andere tekst, bron of soort telt wel', emitted === 5);
    emitCanonicalNotice({ text: 'C', action: { label: 'x', onAction: () => {} } });
    emitCanonicalNotice({ text: 'C', action: { label: 'x', onAction: () => {} } });
    check('meldingen met een knop worden nooit onderdrukt (ook niet over tabbladen heen)', emitted === 7);

    store.set('tsv:notice-recent-v1', JSON.stringify({ 'mcp|success|D': { t: Date.now() - 120_000, tab: 'andere' } }));
    emitCanonicalNotice({ text: 'D', source: 'mcp', kind: 'success' });
    check('na het venster (90 s) mag dezelfde melding uit een ander tabblad opnieuw', emitted === 8);
    store.set('tsv:notice-recent-v1', JSON.stringify({ 'mcp|success|E': { t: Date.now() - 120_000, tab: 'andere' } }));
    emitCanonicalNotice({ text: 'E', source: 'mcp', kind: 'success', dedupeSeconds: 1800 });
    check('een langer venster (30 min, stapmeldingen van de installatiehulp) onderdrukt een herhaling uit een ander tabblad', emitted === 8);
    store.set('tsv:notice-recent-v1', JSON.stringify({ 'mcp|success|G': 12345 }));
    emitCanonicalNotice({ text: 'G', source: 'mcp', kind: 'success' });
    check('oude opslagvorm (zonder tabblad) geeft geen fout', emitted === 9);

    g.localStorage = { getItem: () => { throw new Error('geen opslag'); }, setItem: () => { throw new Error('geen opslag'); } };
    emitCanonicalNotice({ text: 'F' }); emitCanonicalNotice({ text: 'F' });
    check('zonder bruikbare opslag werkt het nog steeds (geen onderdrukking, geen fout)', emitted === 11);
  } finally {
    g.window = old.window; g.localStorage = old.localStorage; g.sessionStorage = old.sessionStorage; g.CustomEvent = old.CustomEvent;
  }

  // Samenvoegen, oplossen en de levensduur (zuiver: geen browser nodig).
  check('samen te voegen: dezelfde melding met andere cijfers («Bestand 3» / «Bestand 4»)',
    samenvoegSleutel('mail', 'error', 'Bestand 3 niet geladen') === samenvoegSleutel('mail', 'error', 'Bestand 4 niet geladen'));
  check('niet samen: andere bron of andere soort', samenvoegSleutel('mail', 'error', 'X') !== samenvoegSleutel('cloud', 'error', 'X') && samenvoegSleutel('mail', 'error', 'X') !== samenvoegSleutel('mail', 'info', 'X'));
  const nu = 1_000_000;
  const rijen = [{ id: 'r1', groep: 'g', createdAt: nu - 60_000, opgelost: false }, { id: 'r2', groep: 'h', createdAt: nu - 60_000 }];
  check('zoekSamenvoeging: een recente, nog openstaande regel met dezelfde sleutel', zoekSamenvoeging(rijen, 'g', nu)?.id === 'r1');
  check('zoekSamenvoeging: buiten het venster of al opgelost → geen (dan een nieuwe regel)',
    zoekSamenvoeging(rijen, 'g', nu + SAMENVOEG_MS + 1) === undefined && zoekSamenvoeging([{ ...rijen[0], opgelost: true }], 'g', nu) === undefined);
  const oud = [{ id: 'f', kind: 'error' as const, onderwerp: 'mail|x', opgelost: false }, { id: 'ok', kind: 'success' as const, onderwerp: 'mail|x' }, { id: 'andere', kind: 'error' as const, onderwerp: 'cloud|y' }];
  const na = losOpEerdere(oud, 'mail|x');
  check('een latere gelukte stap lost de eerdere fout met hetzelfde onderwerp op; andere onderwerpen en de gelukte stap zelf niet',
    na[0].opgelost === true && na[1].opgelost === undefined && na[2].opgelost === undefined);
  check('levensduur: vast → blijft staan (null); anders de seconden, plus extra tijd voor een lange tekst en een uitleg',
    popupLevensduurMs({ vast: true, seconden: 10 }, 'x') === null
    && popupLevensduurMs({ vast: false, seconden: 10 }, 'kort') === 10_000
    && popupLevensduurMs({ vast: false, seconden: 3 }, 'x'.repeat(130)) === 5_000
    && popupLevensduurMs({ vast: false, seconden: 10 }, 'kort', 'y'.repeat(300)) === 14_000
    && popupLevensduurMs({ vast: false, seconden: 1 }, 'kort') === 3_000);
  return einde();
}
