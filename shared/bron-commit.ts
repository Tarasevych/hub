// Regel 3 voor uitrolpakketten (audit 18.10.2026, punt 10): elke release is herleidbaar tot de code waaruit ze is gebouwd.
// BRON-COMMIT in het pakket is óf een volledige git-commit (40 hex), óf uitdrukkelijk «zonder-git:<reden>» (gebouwd buiten git, met
// de reden erbij — die komt op de site te staan als waarschuwing). Leeg, «unknown», een korte hash of iets anders → het pakket wordt
// geweigerd (GEEN_BRON_COMMIT): door de browser-analyse (src/platform/tar-lezen.ts), de voorcontrole van de site
// (backend/uitrol-voorcontrole.ts) én root (deploy/uitrol/mijn-ruimte-uitrol.sh, met dezelfde regel in bash).
// Waarom zo streng: live stond «unknown» en niemand kon zeggen welke code draaide; verschillende agenten bouwen pakketten.
// Zie deploy/REGELS-UITROLPAKKET.md.
export type CommitStatus = 'git' | 'zonder-git' | 'ontbreekt' | 'ongeldig';
export type BronCommit = {
  status: CommitStatus;
  /** De git-commit (40 hex, kleine letters) of ''. */
  commit: string;
  /** De reden bij «zonder-git» (witruimte samengevoegd) of ''. */
  reden: string;
  /** Wat bewaard/getoond wordt: de commit, «zonder-git:<reden>», of '' als ongeldig/ontbrekend. */
  waarde: string;
};
export const MIN_REDEN_ZONDER_GIT = 5;

export function bronCommit(raw: string | null | undefined): BronCommit {
  const t = String(raw ?? '').replace(/\0/g, '').trim();
  if (!t) return { status: 'ontbreekt', commit: '', reden: '', waarde: '' };
  if (/^[0-9a-f]{40}$/.test(t)) { const c = t; return { status: 'git', commit: c, reden: '', waarde: c }; }
  const m = /^zonder-git:\s*([\s\S]*)$/.exec(t);
  if (m) {
    const reden = m[1].replace(/\s+/g, ' ').trim().slice(0, 200);
    if (reden.length >= MIN_REDEN_ZONDER_GIT) return { status: 'zonder-git', commit: '', reden, waarde: `zonder-git:${reden}` };
  }
  return { status: 'ongeldig', commit: '', reden: '', waarde: '' };
}

/** Eén weergave voor de hele site (Zijkant, RunDetail, Geschiedenis, goedkeuring, wizard): kort, lang en of het een waarschuwing is. */
export function commitWeergave(lang: 'uk' | 'nl', raw: string | null | undefined): { kort: string; lang: string; waarschuwing: boolean; status: CommitStatus } {
  const b = bronCommit(raw);
  // Oudere runs bewaarden soms een korte hash (7–39 hex) of een release-commit: tonen, maar niet als «geldig volgens regel 3».
  const t = String(raw ?? '').trim().toLowerCase();
  if (b.status === 'git') return { kort: b.commit.slice(0, 12), lang: b.commit, waarschuwing: false, status: 'git' };
  if (b.status === 'zonder-git') {
    const kort = lang === 'uk' ? 'поза git' : 'buiten git';
    return { kort, lang: lang === 'uk' ? `Зібрано поза git: ${b.reden}` : `Gebouwd buiten git: ${b.reden}`, waarschuwing: true, status: 'zonder-git' };
  }
  if (/^[0-9a-f]{7,39}$/.test(t)) return { kort: t.slice(0, 12), lang: t, waarschuwing: false, status: 'git' };
  return { kort: lang === 'uk' ? 'коміт невідомий' : 'commit onbekend', lang: lang === 'uk' ? 'Коміт невідомий: сервер не записав BRON-COMMIT для цього встановлення (старий запис або встановлення через SSH до 29.10.2026).' : 'Commit onbekend: de server noteerde geen BRON-COMMIT voor deze installatie (oud record of SSH-installatie vóór 29.10.2026).', waarschuwing: true, status: b.status };
}
