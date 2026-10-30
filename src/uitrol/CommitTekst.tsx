// Eén weergave van de commit van een release in het hele «Оновлення»-paneel (audit 18.10.2026, punt 10): de git-commit (kort, mono),
// of een duidelijke waarschuwing «зібрано поза git: <причина>» / «коміт невідомий» — nooit «unknown» of een leeg streepje.
import { AlertTriangle } from 'lucide-react';
import { commitWeergave } from '../../shared/bron-commit';
import type { Lang } from './types';

export default function CommitTekst({ lang, commit, kort = false }: { lang: Lang; commit: string | null | undefined; kort?: boolean }) {
  const c = commitWeergave(lang, commit);
  if (!c.waarschuwing) return <code className='ut-mono' title={c.lang}>{c.kort}</code>;
  return <span className='ut-commit-let-op' data-status={c.status} title={c.lang}><AlertTriangle aria-hidden='true' />{kort ? c.kort : c.lang}</span>;
}
