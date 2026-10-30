// Прозорість випуску: /api/version віддає, який саме випуск зараз працює (версія, коміт, автор, агент, підсумок).
// Дані беруться з файлів у корені релізу (на один рівень вище dist): UITROL-VERSIE, BRON-COMMIT, RELEASE-COMMIT,
// AUTEUR, AGENT, SAMENVATTING. Так агент чи людина завжди бачить версію на живому сайті, без доступу до сервера.
// Читається один раз на старті (файли релізу не змінюються під час роботи).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { bronCommit, type CommitStatus } from '../shared/bron-commit';
import { MANIFEST_BESTAND, MANIFEST_MAX, valideerManifest, type Manifest } from '../shared/uitrol-manifest';

export type ReleaseInfo = {
  versie: string | null;
  commit: string | null;
  /** Regel 3 (shared/bron-commit.ts): git = herleidbaar; zonder-git = uitdrukkelijk buiten git (reden in zonderGitReden); ontbreekt/ongeldig = onbekend. */
  commitStatus: CommitStatus;
  zonderGitReden: string | null;
  releaseCommit: string | null;
  auteur: string | null;
  agent: string | null;
  samenvatting: string | null;
  /** UI-010: tweetalige beschrijving + deelnemers; null bij oude pakketten of een ongeldig manifest. */
  manifest: Manifest | null;
};

const lees = (wortel: string, naam: string, max: number): string | null => {
  try { const v = readFileSync(path.join(wortel, naam), 'utf8').trim(); return v ? v.slice(0, max) : null; } catch { return null; }
};

let gecachet: ReleaseInfo | null = null;
export function releaseInfo(): ReleaseInfo {
  if (gecachet) return gecachet;
  const dist = process.env.DIST_DIR || path.join(process.cwd(), 'dist');
  const wortel = path.resolve(dist, '..');
  const versie = lees(wortel, 'UITROL-VERSIE', 32);
  gecachet = {
    versie: versie && /^[0-9]{8}-[0-9]{6}$/.test(versie) ? versie : versie,
    commit: lees(wortel, 'BRON-COMMIT', 220),
    commitStatus: bronCommit(lees(wortel, 'BRON-COMMIT', 220)).status,
    zonderGitReden: bronCommit(lees(wortel, 'BRON-COMMIT', 220)).reden || null,
    releaseCommit: lees(wortel, 'RELEASE-COMMIT', 40),
    auteur: lees(wortel, 'AUTEUR', 200),
    agent: lees(wortel, 'AGENT', 40),
    samenvatting: lees(wortel, 'SAMENVATTING', 8000),
    manifest: (() => { const r = lees(wortel, MANIFEST_BESTAND, MANIFEST_MAX); return r ? valideerManifest(r, versie || '').manifest : null; })(),
  };
  return gecachet;
}

/** Alleen voor tests: de cache leegmaken. */
export const _resetReleaseInfo = () => { gecachet = null; };
