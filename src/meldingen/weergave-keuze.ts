// Взаємосумісний вибір подання сповіщень біля дзвіночка (MELDPANEEL-003 + meldingen-v2 + meldingen-uitleg-v3).
// За затвердженим рішенням власника типовим є єдиний «Пульт уваги» (`puls`), водночас користувач у налаштуваннях
// має явний вибір компактного списку (`v2`) та розширених пояснень і швидких дій (`uitleg-v3`).
// Keuze tussen de standaard Aandachtspuls (`puls`), de compacte lijst (`v2`) en uitgebreide uitleg (`uitleg-v3`).

import { useEffect, useState } from 'react';
import { useVlag } from '../functievlag-lezen';

export type MeldingWeergaveStijl = 'puls' | 'v2';

export type MeldingWeergaveStaat = {
  stijl: MeldingWeergaveStijl;
  uitlegV3: boolean | null;
};

const OPSLAG_SLEUTEL = 'tsv:melding-weergave-keuze:v1';

const luisteraars = new Set<(staat: MeldingWeergaveStaat) => void>();

const kanaal: BroadcastChannel | null = (() => {
  try {
    return typeof BroadcastChannel === 'function' ? new BroadcastChannel('mr-melding-weergave-keuze') : null;
  } catch {
    return null;
  }
})();

function normaliseer(raw: unknown): MeldingWeergaveStaat {
  if (!raw || typeof raw !== 'object') return { stijl: 'puls', uitlegV3: null };
  const r = raw as { stijl?: unknown; uitlegV3?: unknown };
  return {
    stijl: r.stijl === 'v2' ? 'v2' : 'puls',
    uitlegV3: typeof r.uitlegV3 === 'boolean' ? r.uitlegV3 : null,
  };
}

export function leesMeldingWeergaveKeuze(): MeldingWeergaveStaat {
  if (typeof window === 'undefined') return { stijl: 'puls', uitlegV3: null };
  try {
    const tekst = window.localStorage.getItem(OPSLAG_SLEUTEL);
    if (!tekst) return { stijl: 'puls', uitlegV3: null };
    return normaliseer(JSON.parse(tekst));
  } catch {
    return { stijl: 'puls', uitlegV3: null };
  }
}

function verwittig(staat: MeldingWeergaveStaat): void {
  for (const fn of luisteraars) {
    try {
      fn(staat);
    } catch {
      /* помилка окремого слухача не зупиняє потік */
    }
  }
}

kanaal?.addEventListener('message', (ev) => {
  const nieuw = normaliseer(ev.data);
  try {
    window.localStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify(nieuw));
  } catch {
    /* сховище недоступне */
  }
  verwittig(nieuw);
});

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (ev) => {
    if (ev.key === OPSLAG_SLEUTEL) {
      verwittig(leesMeldingWeergaveKeuze());
    }
  });
}

export function zetMeldingWeergaveKeuze(wijziging: Partial<MeldingWeergaveStaat>): MeldingWeergaveStaat {
  const huidig = leesMeldingWeergaveKeuze();
  const nieuw: MeldingWeergaveStaat = {
    stijl: wijziging.stijl !== undefined ? (wijziging.stijl === 'v2' ? 'v2' : 'puls') : huidig.stijl,
    uitlegV3: wijziging.uitlegV3 !== undefined ? wijziging.uitlegV3 : huidig.uitlegV3,
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify(nieuw));
    } catch {
      /* сховище недоступне */
    }
  }
  verwittig(nieuw);
  try {
    kanaal?.postMessage(nieuw);
  } catch {
    /* канал недоступний */
  }
  return nieuw;
}

export function useMeldingWeergaveKeuze() {
  const vlagV2 = useVlag('meldingen-v2', false);
  const vlagUitlegV3 = useVlag('meldingen-uitleg-v3', false);
  const [staat, setStaat] = useState<MeldingWeergaveStaat>(() => leesMeldingWeergaveKeuze());

  useEffect(() => {
    setStaat(leesMeldingWeergaveKeuze());
    const bijWijziging = (volgende: MeldingWeergaveStaat) => setStaat(volgende);
    luisteraars.add(bijWijziging);
    return () => {
      luisteraars.delete(bijWijziging);
    };
  }, []);

  const eigenUitleg = staat.uitlegV3 !== null;
  const uitlegV3 = staat.uitlegV3 !== null ? staat.uitlegV3 : vlagUitlegV3;

  return {
    stijl: staat.stijl,
    uitlegV3,
    eigenUitleg,
    vlagV2,
    vlagUitlegV3,
  };
}
