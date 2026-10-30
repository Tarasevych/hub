// Werkblad «Blokken» — «Перемістити в…» (stroom D): toetsenbord- en schermlezer-alternatief dat PRECIES doet wat slepen doet.
// Stap 1: plek kiezen (↑/↓, Enter). Ongeldige plekken staan grijs met de reden, nooit verborgen.
// Stap 2: volgorde kiezen (↑/↓: «на початок» / «перед …» / «в кінець»), Enter = uitvoeren. Esc = terug / sluiten.
// Zelfde beoordeling (beoordeel) en dezelfde uitvoering (opKies → opNeerzetten van de sleepregelaar). Geen native prompts.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Neerzetting, NeerzetOordeel, Plek, Sleepbron } from '../../../shared/werkblad-blokken';

export interface PlekKeuze { plek: Plek; titel: string; kinderen: Array<{ id: string; titel: string }> }
export interface PlekKiezerProps {
  bron: Sleepbron;
  bronTitel: string;
  keuzes: PlekKeuze[];
  beoordeel: (bron: Sleepbron, n: Neerzetting) => NeerzetOordeel;
  redenTekst: (o: NeerzetOordeel, plek: Plek) => string;
  opKies: (bron: Sleepbron, n: Neerzetting, oordeel: NeerzetOordeel) => void;
  opSluit: () => void;
  taal?: 'uk' | 'nl';
}

const T = {
  uk: { titel: 'Перемістити в…', stap2: 'Куди саме', begin: 'На початок', voor: 'Перед', eind: 'В кінець', kopie: 'Копіювати (залишити й тут)', terug: 'Назад', sluit: 'Скасувати', doe: 'Перемістити', doeKopie: 'Копіювати', hulp: '↑/↓ — вибір, Enter — далі, Esc — назад' },
  nl: { titel: 'Verplaatsen naar…', stap2: 'Waar precies', begin: 'Aan het begin', voor: 'Vóór', eind: 'Aan het eind', kopie: 'Kopiëren (ook hier laten)', terug: 'Terug', sluit: 'Annuleren', doe: 'Verplaatsen', doeKopie: 'Kopiëren', hulp: '↑/↓ — kiezen, Enter — verder, Esc — terug' },
};

export function PlekKiezer(p: PlekKiezerProps) {
  const t = T[p.taal || 'uk'];
  const [kopie, setKopie] = useState(false);
  const [stap, setStap] = useState<1 | 2>(1);
  const [plekI, setPlekI] = useState(0);
  const [volgI, setVolgI] = useState(0);
  const lijst = useRef<HTMLUListElement>(null);
  const oordelen = useMemo(() => p.keuzes.map((k) => p.beoordeel(p.bron, { doel: k.plek, voor: null, kopie })), [p.keuzes, p.bron, kopie, p]);
  const keuze = p.keuzes[plekI];
  const volgordes = useMemo(() => {
    if (!keuze) return [];
    const k = keuze.kinderen;
    return [{ voor: k[0]?.id ?? null, titel: t.begin }, ...k.slice(1).map((c) => ({ voor: c.id, titel: `${t.voor} «${c.titel}»` })), ...(k.length ? [{ voor: null, titel: t.eind }] : [])];
  }, [keuze, t]);
  useEffect(() => { lijst.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(); }, [stap, plekI, volgI]);

  const uitvoeren = (voor: string | null) => {
    if (!keuze) return;
    const n: Neerzetting = { doel: keuze.plek, voor, kopie };
    const o = p.beoordeel(p.bron, n);
    if (o.ok) p.opKies(p.bron, n, o);
  };
  const naarStap2 = (i: number) => {
    if (!oordelen[i]?.ok) return;
    setPlekI(i); setVolgI(0);
    if (p.keuzes[i].kinderen.length === 0) uitvoeren(null); else setStap(2);
  };
  const toets = (e: KeyboardEvent) => {
    const max = stap === 1 ? p.keuzes.length : volgordes.length;
    const zet = stap === 1 ? setPlekI : setVolgI;
    const nu = stap === 1 ? plekI : volgI;
    if (e.key === 'ArrowDown') { e.preventDefault(); zet(Math.min(max - 1, nu + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); zet(Math.max(0, nu - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); zet(0); }
    else if (e.key === 'End') { e.preventDefault(); zet(max - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (stap === 1) naarStap2(plekI); else uitvoeren(volgordes[volgI]?.voor ?? null); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (stap === 2) setStap(1); else p.opSluit(); }
  };

  return (
    <div className="wb-plekkiezer-achtergrond" onPointerDown={(e) => { if (e.target === e.currentTarget) p.opSluit(); }}>
      <div className="wb-plekkiezer" role="dialog" aria-modal="true" aria-labelledby="wb-plekkiezer-titel" onKeyDown={toets} data-wb-geen-sleep>
        <h2 id="wb-plekkiezer-titel">{stap === 1 ? t.titel : `${t.stap2}: ${keuze?.titel}`}</h2>
        <p className="wb-plekkiezer-bron">«{p.bronTitel}»</p>
        <label className="wb-plekkiezer-kopie"><input type="checkbox" checked={kopie} onChange={(e) => setKopie(e.target.checked)} /> {t.kopie}</label>
        <ul ref={lijst} role="listbox" aria-label={stap === 1 ? t.titel : t.stap2} className="wb-plekkiezer-lijst">
          {stap === 1 ? p.keuzes.map((k, i) => {
            const o = oordelen[i];
            return (
              <li key={k.plek.id} role="option" tabIndex={i === plekI ? 0 : -1} aria-selected={i === plekI} aria-disabled={!o.ok}
                data-plek={k.plek.id} data-geldig={o.ok ? 'ja' : 'nee'} onClick={() => { setPlekI(i); naarStap2(i); }}>
                <span className="wb-plekkiezer-naam">{k.titel}</span>
                {!o.ok && <span className="wb-plekkiezer-reden">{p.redenTekst(o, k.plek)}</span>}
              </li>
            );
          }) : volgordes.map((v, i) => (
            <li key={`${v.voor}-${i}`} role="option" tabIndex={i === volgI ? 0 : -1} aria-selected={i === volgI} data-voor={v.voor ?? ''}
              onClick={() => uitvoeren(v.voor)}>{v.titel}</li>
          ))}
        </ul>
        <p className="wb-plekkiezer-hulp">{t.hulp}</p>
        <div className="wb-plekkiezer-knoppen">
          {stap === 2 && <button type="button" onClick={() => setStap(1)}>{t.terug}</button>}
          <button type="button" onClick={p.opSluit}>{t.sluit}</button>
          <button type="button" className="hoofd" disabled={!oordelen[plekI]?.ok}
            onClick={() => (stap === 1 ? naarStap2(plekI) : uitvoeren(volgordes[volgI]?.voor ?? null))}>{kopie ? t.doeKopie : t.doe}</button>
        </div>
      </div>
    </div>
  );
}
export default PlekKiezer;
