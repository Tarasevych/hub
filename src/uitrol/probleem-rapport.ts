// UITROL-001 · «Скопіювати звіт про проблему»: один текст (Markdown) з описом, причиною, вимогами, витягом журналу й контекстом —
// щоб передати агентові без ручного збирання шматків. Жодних секретів: усе проходить через maskeerGeheimen + маскування паролів у URL.
// UITROL-001 · Probleemrapport: één tekst met beschrijving, oorzaak, vereisten, logfragment en context. Puur (getest), geen DOM.
import { maskeerGeheimen } from '../../shared/geheim-patronen';
import { GROEPEN, type VereistenAntwoord } from '../../shared/uitrol-vereisten';

export type RapportDelen = { oorzaak: boolean; vereisten: boolean; log: boolean; context: boolean };
export type RapportInvoer = {
  lang: 'uk' | 'nl';
  beschrijving: string;
  antwoord: VereistenAntwoord | null;
  archief: { bestand: string; bytes: number; versie: string; commit: string; sha256: string; agent: string; auteur: string } | null;
  omgeving: { actieveVersie: string; site: string; browser: string; tijdzone: string };
  delen: RapportDelen;
  /** Fout van de site zelf (bv. de controle was niet bereikbaar). */
  siteFout?: string;
};

const NIVEAU: Record<string, string> = { ok: '✓', fout: '✗', waarschuwing: '!', wacht: '…', bezig: '…', overgeslagen: '–' };

/** Wachtwoorden in URL's (schema://gebruiker:wachtwoord@host) → schema://gebruiker:***@host. */
export const zonderUrlWachtwoord = (t: string) => t.replace(/([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+):[^\s@/]+@/gi, '$1:***@');

export function rapportTekst(r: RapportInvoer): { tekst: string; gemaskeerd: string[] } {
  const uk = r.lang === 'uk';
  const t = (a: string, b: string) => (uk ? a : b);
  const ant = r.antwoord;
  const uit: string[] = [];
  const kop = ant && !ant.ok ? t('Архів не пройшов перевірку вимог', 'Archief voldoet niet aan de vereisten') : t('Проблема з оновленням сервера', 'Probleem met de serverupdate');
  uit.push(`# ${kop}${r.archief?.versie ? ` · ${r.archief.versie}` : ''}`, '');
  uit.push(`## ${t('Опис', 'Beschrijving')}`, r.beschrijving.trim() || t('(не заповнено)', '(niet ingevuld)'), '');
  if (r.siteFout) uit.push(`**${t('Помилка сайту', 'Fout van de site')}:** \`${r.siteFout}\``, '');

  const fouten = ant?.vereisten.filter((v) => v.niveau === 'fout') || [];
  if (r.delen.oorzaak && fouten.length) {
    uit.push(`## ${t('Причина', 'Oorzaak')}`);
    for (const v of fouten) {
      uit.push(`- **${uk ? v.uk : v.nl}** — ${(uk ? v.waardeUk : v.waardeNl) || ''}`);
      const o = v.oorzaak;
      if (o) {
        uit.push(`  - ${t('Міграція', 'Migratie')}: \`${o.migratie}\`${o.regel ? `, ${t('рядок', 'regel')} ${o.regel}` : ''}`);
        if (o.constraint) uit.push(`  - ${t('Обмеження', 'Beperking')}: \`${o.constraint}\`${o.definitie ? ` — \`${o.definitie}\`` : ''}`);
        if (o.teLang) uit.push(`  - ${t('Фактично', 'Werkelijk')}: ${o.teLang.lengte} > ${o.teLang.grens}`);
        uit.push(`  - PostgreSQL: \`${o.code}\` ${o.bericht}`);
        if (o.detail) uit.push(`  - ${t('Деталі', 'Detail')}: ${o.detail}`);
        uit.push(`  - ${t('Що робити', 'Wat te doen')}: ${uk ? o.actieUk : o.actieNl}`);
        if (o.fragment) uit.push('', '```sql', o.fragment, '```');
      }
    }
    uit.push('');
  }
  if (r.delen.vereisten && ant) {
    uit.push(`## ${t('Вимоги', 'Vereisten')} (${ant.vereisten.filter((v) => v.niveau === 'ok').length}/${ant.vereisten.length} ✓, ${ant.ms} ms)`);
    for (const g of GROEPEN) {
      const lijst = ant.vereisten.filter((v) => v.groep === g.id);
      if (!lijst.length) continue;
      uit.push(`### ${uk ? g.uk : g.nl}`);
      for (const v of lijst) uit.push(`- ${NIVEAU[v.niveau] || '?'} ${uk ? v.uk : v.nl}${(uk ? v.waardeUk : v.waardeNl) ? ` — ${uk ? v.waardeUk : v.waardeNl}` : ''}${v.ms != null ? ` (${v.ms} ms)` : ''}`);
    }
    uit.push('');
  }
  if (r.delen.log && ant?.log.length) {
    uit.push(`## ${t('Журнал перевірки', 'Logboek van de controle')}`, '```text');
    let vorige = 0;
    for (const l of ant.log.slice(-80)) {
      const ms = Date.parse(l.t);
      const delta = vorige && Number.isFinite(ms) ? `+${((ms - vorige) / 1000).toFixed(2)}s` : '';
      if (Number.isFinite(ms)) vorige = ms;
      uit.push(`${l.t.slice(11, 23)} ${delta.padStart(8)} ${l.niveau.padEnd(12)} ${l.tekst}`);
    }
    uit.push('```', '');
  }
  if (r.delen.context) {
    uit.push(`## ${t('Контекст', 'Context')}`);
    if (r.archief) {
      uit.push(`- ${t('Архів', 'Archief')}: \`${r.archief.bestand}\` (${r.archief.bytes} bytes)`);
      uit.push(`- ${t('Версія', 'Versie')}: \`${r.archief.versie}\` · commit \`${r.archief.commit || '—'}\``);
      if (r.archief.sha256) uit.push(`- SHA-256: \`${r.archief.sha256}\``);
      uit.push(`- ${t('Автор / агент', 'Auteur / agent')}: ${r.archief.auteur || '—'} / ${r.archief.agent || '—'}`);
    }
    uit.push(`- ${t('Встановлено зараз', 'Nu geïnstalleerd')}: \`${r.omgeving.actieveVersie || '—'}\``);
    if (ant?.proef.uitslag?.pg) uit.push(`- PostgreSQL: ${ant.proef.uitslag.pg}`);
    uit.push(`- ${t('Сайт', 'Site')}: ${r.omgeving.site}`, `- ${t('Браузер', 'Browser')}: ${r.omgeving.browser}`, `- ${t('Час звіту', 'Tijd van het rapport')}: ${new Date().toISOString()} (${r.omgeving.tijdzone})`);
    if (ant?.id) uit.push(`- ${t('Ідентифікатор перевірки', 'Id van de controle')}: \`${ant.id}\``);
    uit.push('');
  }
  const ruw = zonderUrlWachtwoord(uit.join('\n'));
  const m = maskeerGeheimen(ruw);
  return { tekst: m.tekst, gemaskeerd: m.soorten.map(String) };
}
