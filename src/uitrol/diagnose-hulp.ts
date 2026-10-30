// Zuivere hulpfuncties voor het scherm «Діагностика»: journaalregels ontleden, niveau en pictogram bepalen, groeperen per run, kleur voor
// de uitvoer van een controle. Geen React, geen netwerk: zo is het los te testen en blijft Diagnose.tsx leesbaar.
export type Niveau = 'fout' | 'let-op' | 'ok' | 'info';
export type JRegel = { nr: number; ruw: string; tijd: string; kort: string; eenheid: string; pid: string; tekst: string; niveau: Niveau; markering: string; begin: boolean };
export type JGroep = { id: string; titel: string; tijd: string; run: string; regels: JRegel[]; fouten: number; waarschuwingen: number };

const TIJD = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:[.,]\d+)?(Z|[+-]\d{2}:?\d{2})?\s+(.*)$/;
const REST = /^(?:(\S+)\s+)?([^\s[\]:]+)(?:\[(\d+)\])?:\s?(.*)$/;

export const niveauVan = (tekst: string): Niveau => {
  if (/(failed|\berror\b|\bfout\b|помилк|_MISLUKT|\bGEEN_[A-Z_]+|\bNIET_[A-Z_]+|_ONGELDIG|weiger|відхил|rollback|terugdraai|denied|\bkilled\b|exit-code|не вдалося)/i.test(tekst)) return 'fout';
  if (/(\bwarn|waarschuw|попередж|deprecated|timeout|time-out|retry|opnieuw proberen|\bstil\b|ligt stil|застряг)/i.test(tekst)) return 'let-op';
  if (/(\bklaar\b|geslaagd|success|succeeded|finished|встановлено|\bактив|\bactief\b|goedgekeurd|\bok\b|✓|готово|відповідає)/i.test(tekst)) return 'ok';
  return 'info';
};

/** Pictogram per regel: eerst het niveau-teken bij fouten, anders het onderwerp. */
export const markeringVan = (tekst: string, niveau: Niveau): string => {
  if (niveau === 'fout') return /(rollback|terugdraai)/i.test(tekst) ? '♻️' : '❌';
  if (niveau === 'let-op') return '⚠️';
  if (/(passkey|sleutel|ключ|handtekening|підпис|echtheid|автентичн|webauthn)/i.test(tekst)) return '🔑';
  if (/(migrat|міграц|database|базa?|backup|back-up|резервн|postgres)/i.test(tekst)) return '🗄️';
  if (/(installeer|bouwen|npm|vite|build|збірк|встановл|release)/i.test(tekst)) return '🛠️';
  if (/(pakket|tar\.gz|tarball|пакет|ontvangen|inbox|kopie|копіюв)/i.test(tekst)) return '📦';
  if (/(health|gezondheid|здоров)/i.test(tekst)) return '💚';
  if (/(\bstart\b|started|begin|uitrol|запуск|run )/i.test(tekst)) return '🚀';
  if (/(systemd|stopped|deactivated|service|unit)/i.test(tekst)) return '⚙️';
  if (niveau === 'ok') return '✅';
  return 'ℹ️';
};

const isBegin = (eenheid: string, tekst: string) => /\[uitrol\]\s+(run\b|start\b|begin\b)/i.test(tekst) || (/^systemd$/.test(eenheid) && /^Started\b/.test(tekst));

export function parseJournaal(regels: readonly string[]): JRegel[] {
  return regels.map((ruw, i) => {
    const m = TIJD.exec(ruw);
    let tijd = '', kort = '', eenheid = '', pid = '', tekst = ruw;
    if (m) {
      tijd = `${m[1]} ${m[2]}${m[3] ? ` ${m[3]}` : ''}`; kort = m[2];
      const r = REST.exec(m[4]);
      if (r) { eenheid = r[2]; pid = r[3] || ''; tekst = r[4]; } else tekst = m[4];
    }
    const niveau = niveauVan(tekst);
    return { nr: i, ruw, tijd, kort, eenheid, pid, tekst, niveau, markering: markeringVan(tekst, niveau), begin: isBegin(eenheid, tekst) };
  });
}

/** Groepeert op beginmarkeringen («[uitrol] start/run …» of «Started …»). Oudste groep eerst; regels binnen een groep in tijdvolgorde. */
export function groepeer(regels: JRegel[]): JGroep[] {
  const uit: JGroep[] = [];
  let huidig: JGroep | null = null;
  for (const r of regels) {
    if (!huidig || r.begin) {
      const run = /run\s+(\S+?):/.exec(r.tekst)?.[1] || '';
      huidig = { id: `g${uit.length}`, titel: '', tijd: r.kort, run, regels: [], fouten: 0, waarschuwingen: 0 };
      uit.push(huidig);
    }
    huidig.regels.push(r);
    if (r.niveau === 'fout') huidig.fouten++;
    if (r.niveau === 'let-op') huidig.waarschuwingen++;
  }
  return uit;
}

export function filterRegels(regels: JRegel[], zoek: string, niveaus: ReadonlySet<Niveau>): JRegel[] {
  const q = zoek.trim().toLowerCase();
  return regels.filter((r) => (niveaus.size === 0 || niveaus.has(r.niveau)) && (!q || r.ruw.toLowerCase().includes(q)));
}

/** Tekst met markeringen rond de zoekterm → delen [tekst, isTreffer]. */
export function markeer(tekst: string, zoek: string): Array<[string, boolean]> {
  const q = zoek.trim();
  if (!q) return [[tekst, false]];
  const delen: Array<[string, boolean]> = [];
  const laag = tekst.toLowerCase(), ql = q.toLowerCase();
  let i = 0;
  for (;;) {
    const j = laag.indexOf(ql, i);
    if (j < 0) { if (i < tekst.length) delen.push([tekst.slice(i), false]); break; }
    if (j > i) delen.push([tekst.slice(i, j), false]);
    delen.push([tekst.slice(j, j + q.length), true]);
    i = j + q.length;
  }
  return delen;
}

/** Kleurklasse voor een regel uitvoer van een controle. */
export function uitvoerKlasse(regel: string): 'ok' | 'fout' | 'let-op' | 'stil' | 'kop' | '' {
  if (/^\s*#/.test(regel)) return 'stil';
  if (/^\s*✅/.test(regel)) return 'ok';
  if (/^\s*❌/.test(regel)) return 'fout';
  if (/^\s*(⚪|⚠️)/.test(regel)) return 'let-op';
  if (/^\s*▶/.test(regel)) return 'kop';
  const n = niveauVan(regel);
  return n === 'fout' ? 'fout' : n === 'let-op' ? 'let-op' : '';
}

export const STATUS_VOLGORDE: Record<string, number> = { fout: 0, 'let-op': 1, nieuw: 2, info: 3, ok: 4 };
export const leeftijdKort = (sec: number, uk: boolean) => (sec < 90 ? `${sec} ${uk ? 'с' : 's'}` : sec < 5400 ? `${Math.round(sec / 60)} ${uk ? 'хв' : 'min'}` : `${Math.round(sec / 3600)} ${uk ? 'год' : 'u'}`);
export const duurTekst = (ms: number, uk: boolean) => {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ${uk ? 'мс' : 'ms'}`;
  const s = ms / 1000;
  if (s < 90) return `${s < 10 ? s.toFixed(1) : Math.round(s)} ${uk ? 'с' : 's'}`;
  if (s < 5400) return `${Math.round(s / 60)} ${uk ? 'хв' : 'min'}`;
  return `${Math.round(s / 3600)} ${uk ? 'год' : 'u'}`;
};
