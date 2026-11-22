// Реактивне сховище умовного відкладення та розумних підказок тиші для Пульта уваги (MELDPANEEL-002).
// Синхронізується між вкладками і автоматично повертає відкладені за умовою сповіщення в потрібний момент.

import { useCallback, useEffect, useState } from 'react';
import type { MeldingEcosysteemGebeurtenis, MeldingSubdomein } from '../../../shared/meldingen-ecosysteem';
import {
  isUitstelVoorwaardeVervuld,
  maakVoorwaardelijkUitstel,
  registreerWeggekliktZonderOpenen,
  type SlimmeStilteSuggestie,
  type Taal,
  type VoorwaardelijkUitstelRegel,
  type VoorwaardelijkUitstelSoort,
} from '../../../shared/meldingen-puls/kern';

const UITSTEL_SLEUTEL = (scope: string) => `tsv:melding-puls:uitstel:v1:${scope || 'anon'}`;
const STILTE_TELLER_SLEUTEL = (scope: string) => `tsv:melding-puls:stilte-teller:v1:${scope || 'anon'}`;

function leesUitstelLijst(scope: string): VoorwaardelijkUitstelRegel[] {
  try {
    const raw = localStorage.getItem(UITSTEL_SLEUTEL(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function schrijfUitstelLijst(scope: string, lijst: VoorwaardelijkUitstelRegel[]): void {
  try {
    localStorage.setItem(UITSTEL_SLEUTEL(scope), JSON.stringify(lijst.slice(-150)));
  } catch {
    /* приватний режим або недоступне локальне сховище */
  }
}

function leesStilteTellers(scope: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(STILTE_TELLER_SLEUTEL(scope));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function schrijfStilteTellers(scope: string, map: Record<string, number>): void {
  try {
    localStorage.setItem(STILTE_TELLER_SLEUTEL(scope), JSON.stringify(map));
  } catch {
    /* безпечний пропуск */
  }
}

export function usePulsSlimmeStaat(opties: {
  scope: string;
  lang: Taal;
  subdomeinNu: MeldingSubdomein;
  stroom: readonly MeldingEcosysteemGebeurtenis[];
  onWekGebeurtenis: (geb: MeldingEcosysteemGebeurtenis) => void;
}) {
  const { scope, lang, subdomeinNu, stroom, onWekGebeurtenis } = opties;
  const [uitstelRegels, setUitstelRegels] = useState<VoorwaardelijkUitstelRegel[]>(() => leesUitstelLijst(scope));
  const [stilteSuggestie, setStilteSuggestie] = useState<SlimmeStilteSuggestie | null>(null);

  useEffect(() => {
    setUitstelRegels(leesUitstelLijst(scope));
  }, [scope]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onStorage = (e: StorageEvent) => {
      if (e.key === UITSTEL_SLEUTEL(scope)) {
        setUitstelRegels(leesUitstelLijst(scope));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [scope]);

  // Автоматична перевірка виконання умов відкладення (відкриття на ПК, вхід у потрібний розділ, завершення дії)
  useEffect(() => {
    if (!uitstelRegels.length || typeof window === 'undefined') return undefined;
    const controleer = () => {
      const nu = Date.now();
      const schermBreedte = window.innerWidth || 1280;
      const isAanraakScherm = Boolean(
        typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches && schermBreedte < 900,
      );
      const heeftRecentSuccesSignaal = stroom.some(
        (g) =>
          nu - g.bijgewerktOp < 10 * 60_000 &&
          /(завершено|виконано|синхронізовано|klaar|voltooid|gesynchroniseerd)/i.test(`${g.bron} ${g.titel}`),
      );

      const overblijvend: VoorwaardelijkUitstelRegel[] = [];
      const teWekken: string[] = [];
      for (const r of uitstelRegels) {
        if (
          isUitstelVoorwaardeVervuld(r, {
            nu,
            schermBreedte,
            isAanraakScherm,
            subdomeinNu,
            heeftRecentSuccesSignaal,
          })
        ) {
          teWekken.push(r.gebeurtenisId);
        } else {
          overblijvend.push(r);
        }
      }
      if (teWekken.length > 0) {
        schrijfUitstelLijst(scope, overblijvend);
        setUitstelRegels(overblijvend);
        for (const id of teWekken) {
          const gevonden = stroom.find((g) => g.id === id);
          if (gevonden && gevonden.status === 'uitgesteld') {
            onWekGebeurtenis(gevonden);
          }
        }
      }
    };

    controleer();
    const timer = window.setInterval(controleer, 15_000);
    window.addEventListener('resize', controleer);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', controleer);
    };
  }, [uitstelRegels, stroom, subdomeinNu, scope, onWekGebeurtenis]);

  const planVoorwaardelijkUitstel = useCallback(
    (gebeurtenisId: string, soort: VoorwaardelijkUitstelSoort, doelSubdomein?: MeldingSubdomein): number => {
      const { regel, uitstelMinuten } = maakVoorwaardelijkUitstel(gebeurtenisId, soort, Date.now(), doelSubdomein);
      setUitstelRegels((huidig) => {
        const bijgewerkt = [...huidig.filter((x) => x.gebeurtenisId !== gebeurtenisId), regel];
        schrijfUitstelLijst(scope, bijgewerkt);
        return bijgewerkt;
      });
      return uitstelMinuten;
    },
    [scope],
  );

  const wisUitstelRegel = useCallback(
    (gebeurtenisId: string) => {
      setUitstelRegels((huidig) => {
        if (!huidig.some((x) => x.gebeurtenisId === gebeurtenisId)) return huidig;
        const bijgewerkt = huidig.filter((x) => x.gebeurtenisId !== gebeurtenisId);
        schrijfUitstelLijst(scope, bijgewerkt);
        return bijgewerkt;
      });
    },
    [scope],
  );

  const meldSnelOpgeruimd = useCallback(
    (geb: MeldingEcosysteemGebeurtenis) => {
      const huidig = leesStilteTellers(scope);
      const { nieuweMap, suggestie } = registreerWeggekliktZonderOpenen(huidig, geb, lang, 3);
      schrijfStilteTellers(scope, nieuweMap);
      if (suggestie) setStilteSuggestie(suggestie);
    },
    [scope, lang],
  );

  const sluitStilteSuggestie = useCallback(
    (resetTeller = true) => {
      if (resetTeller && stilteSuggestie) {
        const huidig = leesStilteTellers(scope);
        delete huidig[stilteSuggestie.bronSleutel];
        schrijfStilteTellers(scope, huidig);
      }
      setStilteSuggestie(null);
    },
    [scope, stilteSuggestie],
  );

  return {
    uitstelRegels,
    planVoorwaardelijkUitstel,
    wisUitstelRegel,
    stilteSuggestie,
    meldSnelOpgeruimd,
    sluitStilteSuggestie,
  };
}
