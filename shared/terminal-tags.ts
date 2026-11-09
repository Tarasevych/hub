// UITROL-001 · Gekleurde labels («мітки») voor terminalregels: aan welk onderdeel hoort een regel (root-script, installer, npm, vite,
// database, systemd, gezondheid…) — zodat de lezer in één oogopslag ziet wat bij wat hoort. Puur (geen React/DOM), getest in
// tests/eenheid/terminal-tags.test.ts. De labels veranderen de tekst niet: kopiëren/downloaden blijven het origineel.
// Кольорові мітки рядків термінала: до якого етапу/інструмента належить рядок. Текст рядка не змінюється.
export type TagId = 'root' | 'installer' | 'proef' | 'kopie' | 'npm' | 'bouwen' | 'pgversie' | 'backup' | 'migraties' | 'activeren' | 'gezondheid' | 'nabewaken' | 'stop' | 'systemd' | 'db' | 'vite' | 'fout';
export type Tag = { id: TagId; uk: string; nl: string };

export const TAGS: Record<TagId, Tag> = {
  root: { id: 'root', uk: 'root', nl: 'root' },
  installer: { id: 'installer', uk: 'інсталятор', nl: 'installer' },
  proef: { id: 'proef', uk: 'проба', nl: 'proef' },
  kopie: { id: 'kopie', uk: 'копія', nl: 'kopie' },
  npm: { id: 'npm', uk: 'npm', nl: 'npm' },
  bouwen: { id: 'bouwen', uk: 'збірка', nl: 'bouwen' },
  pgversie: { id: 'pgversie', uk: 'PostgreSQL', nl: 'PostgreSQL' },
  backup: { id: 'backup', uk: 'бекап', nl: 'back-up' },
  migraties: { id: 'migraties', uk: 'міграції', nl: 'migraties' },
  activeren: { id: 'activeren', uk: 'перемикання', nl: 'omschakelen' },
  gezondheid: { id: 'gezondheid', uk: 'здоров’я', nl: 'gezondheid' },
  nabewaken: { id: 'nabewaken', uk: 'нагляд', nl: 'nabewaking' },
  stop: { id: 'stop', uk: 'зупинка', nl: 'stop' },
  systemd: { id: 'systemd', uk: 'systemd', nl: 'systemd' },
  db: { id: 'db', uk: 'БД', nl: 'database' },
  vite: { id: 'vite', uk: 'vite', nl: 'vite' },
  fout: { id: 'fout', uk: 'помилка', nl: 'fout' },
};

/** Onderdelen van installeer-app.sh («[installeer] stap: <id> (<pct>%)») die als doorlopend label gelden voor de regels erna. */
const STAP_TAGS: Partial<Record<string, TagId>> = { proef: 'proef', kopie: 'kopie', npm: 'npm', bouwen: 'bouwen', pgversie: 'pgversie', backup: 'backup', migraties: 'migraties', activeren: 'activeren', gezondheid: 'gezondheid', nabewaken: 'nabewaken', gestopt: 'stop' };

const STAP = /^\[installeer\] stap: (\S+) \((\d+)%\)/;
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

/**
 * Labels voor een reeks regels (in volgorde). Een «stap:»-regel van de installer zet het lopende onderdeel; uitvoer van derden (npm,
 * vite, psql) erft dat onderdeel én krijgt het eigen hulpmiddel als tweede label. Regels van het root-script krijgen «root».
 */
export function regelTags(teksten: string[]): Tag[][] {
  let lopend: TagId | null = null;
  return teksten.map((ruw) => {
    const t = ruw.replace(ANSI, '').trim();
    const uit: Tag[] = [];
    const duw = (id: TagId) => { if (!uit.some((x) => x.id === id)) uit.push(TAGS[id]); };
    const stap = STAP.exec(t);
    if (stap) { lopend = STAP_TAGS[stap[1]] ?? null; duw('installer'); if (lopend) duw(lopend); return uit; }
    if (/^\[uitrol\]/.test(t)) {
      duw('root');
      if (/^\[uitrol\] (STOP:|installatie gestopt door de eigenaar|stopverzoek)/.test(t)) duw('stop');
      else if (/GEWEIGERD|AFGEBROKEN|FOUT:|installatie mislukt/.test(t)) duw('fout');
      return uit;
    }
    if (/^\[installeer\]/.test(t)) {
      duw('installer');
      if (/gestopt door een signaal|gestopt door de eigenaar/.test(t)) duw('stop');
      else if (/^\[installeer\] FOUT:/.test(t)) duw('fout');
      else if (lopend) duw(lopend);
      return uit;
    }
    if (lopend) duw(lopend);
    if (/^npm (warn|error|notice|ERR!)|^added \d+ packages|^audited \d+ packages|^found \d+ vulnerabilit|^npm ci\b|^> .*@.*\s(build|test)/.test(t)) duw('npm');
    else if (/^vite v\d|✓ built in|rendering chunks|computing gzip size|^dist\/[\w./-]+\s+[\d.]+ kB|transforming\.\.\./.test(t)) duw('vite');
    else if (/^(psql|pg_dump|pg_restore)\b|^(ERROR|DETAIL|HINT|LINE \d+|CONTEXT):\s|^NOTICE:|\bmigrat(ie|ion)s? \d{4}_|^\d{4}_[a-z0-9_]+\.sql\b/.test(t)) duw('db');
    else if (/^(systemctl|journalctl)\b|\bsystemd\b|\.service\b|\.timer\b|\.path\b/.test(t)) duw('systemd');
    if (/\b(ERROR|FATAL|error TS\d+|Traceback|FAILED|mislukt|ПОМИЛКА)\b/.test(t) && !uit.some((x) => x.id === 'fout')) duw('fout');
    return uit;
  });
}
