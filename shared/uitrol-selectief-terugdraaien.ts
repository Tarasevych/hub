// UPD-011: Реєстр змін кожного випуску, пофайлове порівняння версій і планування
// вибіркового відкликання КОНКРЕТНОГО оновлення без втрати пізніших оновлень.
// Wijzigingsregister per release, bestandsvergelijking en selectief intrekken zonder latere updates te verliezen.

import type { DrieFactorenOordeel, HerkomstKanaal } from './uitrol-drie-factoren';

export type ReleaseBestand = {
  pad: string;
  actie: 'toegevoegd' | 'gewijzigd' | 'verwijderd';
  sha256?: string;
};

export type ReleaseWijzigingItem = {
  versie: string;
  voorstelId: string;
  commitSha: string;
  basisVersie: string;
  basisCommit: string;
  herkomstKanaal: HerkomstKanaal;
  herkomstSleutelId: string;
  auteur: string;
  agent: string;
  taakId: string;
  samenvattingUk: string;
  samenvattingNl: string;
  drieFactoren: DrieFactorenOordeel | null;
  bestanden: ReleaseBestand[];
  migraties: string[];
  commits: string[];
  status: 'wacht' | 'geinstalleerd' | 'teruggedraaid' | 'selectief_aangevraagd' | 'selectief_ingetrokken' | 'mislukt' | 'afgewezen';
  aangemaaktOp: string;
  geinstalleerdOp: string;
  ingetrokkenOp: string;
  ingetrokkenVersie: string;
  ingetrokkenReden: string;
};

export type BestandVergelijk = {
  pad: string;
  inDoel: boolean;
  inHuidig: boolean;
  gewijzigdInLatere: string[];
};

export type ReleaseVergelijking = {
  doelVersie: string;
  huidigeVersie: string;
  tussenliggendeVersies: string[];
  alleenInDoel: string[];
  overschrevenLater: Array<{ pad: string; doorVersies: string[] }>;
  alleenInLatere: string[];
  migratiesInDoel: string[];
};

export type SelectiefTerugdraaiPlan = {
  doelVersie: string;
  doelCommit: string;
  huidigeVersie: string;
  behoeftHandmatigeSamenvoeging: boolean;
  veiligDirectTerugtezetten: string[];
  overlappendeBestanden: Array<{ pad: string; latereVersies: string[] }>;
  behoudenLatereVersies: string[];
  waarschuwingMigraties: string[];
  gitRevertOpdracht: string;
  samenvattingUk: string;
  samenvattingNl: string;
};

const SCHOON_PAD = (p: string) => String(p || '').trim().replace(/^\/+/, '').replace(/\\/g, '/');

export function normaliseerBestanden(ruw: unknown): ReleaseBestand[] {
  if (!Array.isArray(ruw)) return [];
  const gezien = new Set<string>();
  const uit: ReleaseBestand[] = [];
  for (const x of ruw) {
    if (typeof x === 'string') {
      const pad = SCHOON_PAD(x);
      if (!pad || gezien.has(pad)) continue;
      gezien.add(pad);
      uit.push({ pad, actie: 'gewijzigd' });
    } else if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      const pad = SCHOON_PAD(String(o.pad || o.path || ''));
      if (!pad || gezien.has(pad)) continue;
      gezien.add(pad);
      const a = String(o.actie || o.action || 'gewijzigd');
      const actie = a === 'toegevoegd' || a === 'verwijderd' ? a : 'gewijzigd';
      const sha256 = typeof o.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(o.sha256) ? o.sha256.toLowerCase() : undefined;
      uit.push({ pad, actie, ...(sha256 ? { sha256 } : {}) });
    }
    if (uit.length >= 2000) break;
  }
  return uit;
}

/** Порівнює вибраний історичний випуск із поточним станом та проміжними пізнішими випусками. */
export function vergelijkReleaseBestanden(
  alleReleases: readonly ReleaseWijzigingItem[],
  doelVersie: string,
  huidigeVersie?: string,
): ReleaseVergelijking | null {
  const gesorteerd = [...alleReleases].sort((a, b) => a.versie.localeCompare(b.versie));
  const doelIdx = gesorteerd.findIndex((r) => r.versie === doelVersie);
  if (doelIdx < 0) return null;
  const doel = gesorteerd[doelIdx];
  const huidig = huidigeVersie
    ? gesorteerd.find((r) => r.versie === huidigeVersie) || gesorteerd[gesorteerd.length - 1]
    : gesorteerd[gesorteerd.length - 1];

  const later = gesorteerd.slice(doelIdx + 1).filter((r) => r.status === 'geinstalleerd' || r.versie === huidig?.versie);
  const doelPaden = new Set(doel.bestanden.map((b) => b.pad));
  const laterMap = new Map<string, string[]>();
  for (const r of later) {
    for (const b of r.bestanden) {
      const lijst = laterMap.get(b.pad) || [];
      lijst.push(r.versie);
      laterMap.set(b.pad, lijst);
    }
  }

  const alleenInDoel: string[] = [];
  const overschrevenLater: Array<{ pad: string; doorVersies: string[] }> = [];
  for (const pad of doelPaden) {
    const door = laterMap.get(pad);
    if (door && door.length) overschrevenLater.push({ pad, doorVersies: door });
    else alleenInDoel.push(pad);
  }
  const alleenInLatere: string[] = [];
  for (const pad of laterMap.keys()) {
    if (!doelPaden.has(pad)) alleenInLatere.push(pad);
  }

  return {
    doelVersie: doel.versie,
    huidigeVersie: huidig?.versie || doel.versie,
    tussenliggendeVersies: later.map((r) => r.versie),
    alleenInDoel: alleenInDoel.sort(),
    overschrevenLater: overschrevenLater.sort((a, b) => a.pad.localeCompare(b.pad)),
    alleenInLatere: alleenInLatere.sort(),
    migratiesInDoel: [...doel.migraties],
  };
}

/**
 * Будує план ВИБІРКОВОГО відкликання одного конкретного оновлення без втрати всіх пізніших оновлень:
 * - файли, яких не торкалися пізніші випуски, відкочуються чисто (`veiligDirectTerugtezetten`);
 * - файли з перетином у пізніших випусках позначаються окремо (`overlappendeBestanden`) для акуратного злиття;
 * - усі пізніші випуски (`behoudenLatereVersies`) зберігаються повністю;
 * - міграції БД ніколи не видаляються руйнівно (попереджаємо про зворотну сумісність).
 */
export function planSelectiefTerugdraaien(
  alleReleases: readonly ReleaseWijzigingItem[],
  doelVersie: string,
  huidigeVersie?: string,
): SelectiefTerugdraaiPlan | null {
  const doel = alleReleases.find((r) => r.versie === doelVersie);
  const verg = vergelijkReleaseBestanden(alleReleases, doelVersie, huidigeVersie);
  if (!doel || !verg) return null;

  const commitRef = doel.commitSha ? doel.commitSha.slice(0, 12) : `<commit-${doel.versie}>`;
  const behoeftHandmatigeSamenvoeging = verg.overschrevenLater.length > 0 || verg.migratiesInDoel.length > 0;
  const gitRevertOpdracht = doel.commits.length > 1
    ? `git revert --no-commit ${doel.commits.slice().reverse().join(' ')}`
    : `git revert --no-commit -m 1 ${commitRef}`;

  const samenvattingUk = behoeftHandmatigeSamenvoeging
    ? `Вибіркове відкликання ${doel.versie}: ${verg.alleenInDoel.length} файл(ів) відкочуються чисто, ${verg.overschrevenLater.length} файл(ів) змінено пізнішими випусками (${verg.tussenliggendeVersies.join(', ') || '—'}) і потребують акуратного збереження пізніших правок.${verg.migratiesInDoel.length ? ` Міграції БД (${verg.migratiesInDoel.join(', ')}) лишаються зворотно сумісними.` : ''}`
    : `Вибіркове відкликання ${doel.versie}: усі ${verg.alleenInDoel.length} файл(ів) можна безпечно повернути до попереднього стану без жодного конфлікту з пізнішими випусками (${verg.tussenliggendeVersies.length}).`;

  const samenvattingNl = behoeftHandmatigeSamenvoeging
    ? `Selectief intrekken van ${doel.versie}: ${verg.alleenInDoel.length} bestand(en) gaan schoon terug, ${verg.overschrevenLater.length} bestand(en) zijn in latere releases (${verg.tussenliggendeVersies.join(', ') || '—'}) gewijzigd en vragen zorgvuldig behoud van latere aanpassingen.${verg.migratiesInDoel.length ? ` Databasemigraties (${verg.migratiesInDoel.join(', ')}) blijven achterwaarts compatibel.` : ''}`
    : `Selectief intrekken van ${doel.versie}: alle ${verg.alleenInDoel.length} bestand(en) kunnen zonder conflict met latere releases (${verg.tussenliggendeVersies.length}) worden teruggezet.`;

  return {
    doelVersie: doel.versie,
    doelCommit: doel.commitSha,
    huidigeVersie: verg.huidigeVersie,
    behoeftHandmatigeSamenvoeging,
    veiligDirectTerugtezetten: verg.alleenInDoel,
    overlappendeBestanden: verg.overschrevenLater.map((x) => ({ pad: x.pad, latereVersies: x.doorVersies })),
    behoudenLatereVersies: verg.tussenliggendeVersies,
    waarschuwingMigraties: verg.migratiesInDoel,
    gitRevertOpdracht,
    samenvattingUk,
    samenvattingNl,
  };
}

/** Формує точне завдання для ШІ-агента або розробника на створення нового компенсаційного випуску без втрати пізніших оновлень. */
export function bouwSelectiefAiOpdracht(plan: SelectiefTerugdraaiPlan, reden: string, taal: 'uk' | 'nl'): string {
  const schoon = reden.trim() || (taal === 'nl' ? 'Op verzoek van de eigenaar' : 'За рішенням власника');
  if (taal === 'nl') {
    return [
      `SELECTIEF INTREKKEN VAN RELEASE ${plan.doelVersie} (huidige versie: ${plan.huidigeVersie})`,
      `Reden: ${schoon}`,
      `Behoud ALLE latere releases (${plan.behoudenLatereVersies.join(', ') || 'geen'}).`,
      `Basisopdracht: ${plan.gitRevertOpdracht}`,
      `Schoon terug te zetten (${plan.veiligDirectTerugtezetten.length}): ${plan.veiligDirectTerugtezetten.slice(0, 25).join(', ') || 'geen'}`,
      `Overlappende bestanden (${plan.overlappendeBestanden.length}): ${plan.overlappendeBestanden.map((x) => `${x.pad} [later: ${x.latereVersies.join(', ')}]`).join('; ') || 'geen'}`,
      plan.waarschuwingMigraties.length ? `Let op migraties (niet vernietigend verwijderen): ${plan.waarschuwingMigraties.join(', ')}` : 'Geen migratieconflicten.',
      'Bouw daarna een nieuwe release met TRACE-001 en 3-factorengoedkeuring; de eigenaar keurt zelf goed met passkey.',
    ].join('\n');
  }
  return [
    `ВИБІРКОВЕ ВІДКЛИКАННЯ ВИПУСКУ ${plan.doelVersie} (поточна версія: ${plan.huidigeVersie})`,
    `Причина: ${schoon}`,
    `Зберегти ВСІ пізніші випуски (${plan.behoudenLatereVersies.join(', ') || 'немає'}).`,
    `Базова команда: ${plan.gitRevertOpdracht}`,
    `Чистий відкат файлів (${plan.veiligDirectTerugtezetten.length}): ${plan.veiligDirectTerugtezetten.slice(0, 25).join(', ') || 'немає'}`,
    `Файли з перетином (${plan.overlappendeBestanden.length}): ${plan.overlappendeBestanden.map((x) => `${x.pad} [пізніші: ${x.latereVersies.join(', ')}]`).join('; ') || 'немає'}`,
    plan.waarschuwingMigraties.length ? `Увага на міграції БД (не видаляти руйнівно): ${plan.waarschuwingMigraties.join(', ')}` : 'Конфліктів міграцій немає.',
    'Після цього зібрати новий випуск із TRACE-001 і 3-чинниковою перевіркою; встановлення схвалює власник ключем доступу.',
  ].join('\n');
}
