// SEC-002 (http-rand-01): vangnet van het proces. Eén onopgevangen uitzondering of afgewezen belofte in de afhandeling
// van één verzoek mag niet het hele serverproces stoppen: dat verbreekt elk lopend verzoek, alle agent- en
// extensieverbindingen en sluit de in het geheugen geopende gegevenssleutels van alle gebruikers.
// Het vangnet logt (zonder inhoud van verzoeken) en telt. Blijft het regenen — meer dan MAX_PER_VENSTER binnen
// VENSTER_MS — dan is de toestand van het proces niet meer te vertrouwen en stopt het met code 1; systemd
// (Restart=on-failure) start het dan schoon opnieuw.
const VENSTER_MS = 60_000;
const MAX_PER_VENSTER = 50;

type Stand = { uitzonderingen: number; afwijzingen: number; laatste: number; laatsteSoort: string };
const stand: Stand = { uitzonderingen: 0, afwijzingen: 0, laatste: 0, laatsteSoort: '' };
let recent: number[] = [];
let ingesteld = false;

/** Tellers voor diagnose (geen foutteksten: die staan alleen in het serverjournaal). */
export function procesVangnetStand(): Stand { return { ...stand }; }

const kort = (e: unknown) => {
  const fout = e as { stack?: unknown; message?: unknown } | null;
  return String(fout?.stack || fout?.message || e).slice(0, 2000);
};

/** true = het proces mag doorgaan; false = te veel fouten in korte tijd (de aanroeper stopt het proces). */
export function vangnetTel(soort: 'uitzondering' | 'afwijzing', nu = Date.now()): boolean {
  if (soort === 'uitzondering') stand.uitzonderingen += 1; else stand.afwijzingen += 1;
  stand.laatste = nu;
  stand.laatsteSoort = soort;
  recent = recent.filter((t) => nu - t < VENSTER_MS);
  recent.push(nu);
  return recent.length <= MAX_PER_VENSTER;
}

/** Alleen voor tests: tellers en venster leegmaken. */
export function _vangnetLeeg(): void { stand.uitzonderingen = 0; stand.afwijzingen = 0; stand.laatste = 0; stand.laatsteSoort = ''; recent = []; }

/** Eén keer bij de start van het serverproces (server/start.ts, blok isMain). */
export function procesVangnetInstellen(stoppen: (code: number) => void = (code) => process.exit(code)): void {
  if (ingesteld) return;
  ingesteld = true;
  const verwerk = (soort: 'uitzondering' | 'afwijzing', e: unknown) => {
    console.error(`[server] onopgevangen ${soort} (proces blijft draaien):`, kort(e));
    if (!vangnetTel(soort)) {
      console.error(`[server] meer dan ${MAX_PER_VENSTER} onopgevangen fouten binnen ${VENSTER_MS / 1000} s: proces stopt voor een schone herstart`);
      stoppen(1);
    }
  };
  process.on('uncaughtException', (e) => verwerk('uitzondering', e));
  process.on('unhandledRejection', (e) => verwerk('afwijzing', e));
}
